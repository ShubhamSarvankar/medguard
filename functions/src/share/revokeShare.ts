import * as functions from "firebase-functions";
import { FieldValue } from "@google-cloud/firestore";
import { z } from "zod";
import {
  getShareGrant,
  updateShareGrant,
  serverTimestamp,
  db,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  shareId: z.string().min(1),
});

export const revokeShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid request."
    );
  }

  const { shareId } = parsed.data;
  const callerUid = context.auth.uid;

  const grant = await getShareGrant(shareId);
  if (!grant) {
    throw new functions.https.HttpsError("not-found", "Share not found.");
  }

  if (grant.senderUid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only the record owner can revoke a share."
    );
  }

  if (grant.status === "revoked" || grant.status === "expired") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Share is already ${grant.status}.`
    );
  }

  const revokedAt = serverTimestamp();

  // Removing from the grants map causes Firestore security rules to deny access immediately.
  const batch = db.batch();

  batch.update(db.collection("shares").doc(shareId), {
    status: "revoked",
    revokedAt,
  });

  if (grant.recipientUid) {
    batch.update(db.collection("records").doc(grant.recordId), {
      [`grants.${grant.recipientUid}`]: FieldValue.delete(),
    });
  }

  await batch.commit();

  await writeAuditLog({
    actorUid: callerUid,
    actionType: "share.revoke",
    recordId: grant.recordId,
    shareId,
  });

  return {
    shareId,
    revokedAt: revokedAt.toDate().toISOString(),
  };
});