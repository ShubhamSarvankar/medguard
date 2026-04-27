import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {
  db,
  getPendingDeletionRequests,
  updateDeletionRequest,
  serverTimestamp,
} from "../lib/firestoreAdmin";

function anonymizeUid(uid: string): string {
  return "anon-" + crypto.createHash("sha256").update(uid).digest("hex").slice(0, 16);
}

export async function runAccountDeletions(): Promise<void> {
  const requests = await getPendingDeletionRequests();
  if (requests.length === 0) return;

  await Promise.all(
    requests.map(async (req) => {
      const { uid, deletionRequestId } = req;
      try {
        const records = await db
          .collection("records")
          .where("ownerUid", "==", uid)
          .get();
        await Promise.all(
          records.docs.map(async (recordDoc) => {
            const [annotations, attachmentMeta] = await Promise.all([
              recordDoc.ref.collection("annotations").get(),
              recordDoc.ref.collection("attachmentMeta").get(),
            ]);
            const subBatch = db.batch();
            annotations.docs.forEach((d) => subBatch.delete(d.ref));
            attachmentMeta.docs.forEach((d) => subBatch.delete(d.ref));
            subBatch.delete(recordDoc.ref);
            await subBatch.commit();
          })
        );

        const pendingRecords = await db
          .collection("pendingRecords")
          .where("ownerUid", "==", uid)
          .get();
        if (!pendingRecords.empty) {
          const pendingBatch = db.batch();
          pendingRecords.docs.forEach((d) => pendingBatch.delete(d.ref));
          await pendingBatch.commit();
        }

        try {
          const bucket = admin.storage().bucket();
          await bucket.deleteFiles({ prefix: `users/${uid}/` });
        } catch {
          functions.logger.warn("Storage deletion skipped (expected in emulator)", { uid });
        }

        const [sentShares, receivedShares] = await Promise.all([
          db.collection("shares").where("senderUid", "==", uid).get(),
          db.collection("shares").where("recipientUid", "==", uid).get(),
        ]);
        const allShareDocs = [...sentShares.docs, ...receivedShares.docs];
        if (allShareDocs.length > 0) {
          const shareBatch = db.batch();
          allShareDocs.forEach((d) => shareBatch.delete(d.ref));
          await shareBatch.commit();
        }

        const invites = await db
          .collection("careCircleInvites")
          .where("patientUid", "==", uid)
          .get();
        if (!invites.empty) {
          const inviteBatch = db.batch();
          invites.docs.forEach((d) => inviteBatch.delete(d.ref));
          await inviteBatch.commit();
        }

        const careCircle = await db
          .collection("users")
          .doc(uid)
          .collection("careCircle")
          .get();
        const userBatch = db.batch();
        careCircle.docs.forEach((d) => userBatch.delete(d.ref));
        userBatch.delete(db.collection("users").doc(uid));
        await userBatch.commit();

        // Audit entries are anonymized, not deleted — retained 7 years per compliance.
        const auditEntries = await db
          .collection("auditLog")
          .where("actorUid", "==", uid)
          .get();
        if (!auditEntries.empty) {
          const anonUid = anonymizeUid(uid);
          const chunks: admin.firestore.QueryDocumentSnapshot[][] = [];
          for (let i = 0; i < auditEntries.docs.length; i += 500) {
            chunks.push(auditEntries.docs.slice(i, i + 500));
          }
          await Promise.all(
            chunks.map(async (chunk) => {
              const auditBatch = db.batch();
              chunk.forEach((d) => auditBatch.update(d.ref, { actorUid: anonUid }));
              await auditBatch.commit();
            })
          );
        }

        try {
          await admin.auth().deleteUser(uid);
        } catch {
          functions.logger.warn("Auth account deletion failed (may not exist)", { uid });
        }

        await updateDeletionRequest(deletionRequestId, {
          processed: true,
          processedAt: serverTimestamp(),
        });

        functions.logger.info("Account deletion completed", { uid, deletionRequestId });
      } catch (err) {
        functions.logger.error("Account deletion failed", {
          uid,
          deletionRequestId,
          error: err instanceof Error ? err.constructor.name : "UnknownError",
        });
      }
    })
  );
}

export const processAccountDeletions = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    await runAccountDeletions();
  });
