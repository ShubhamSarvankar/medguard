import * as functions from "firebase-functions";
import { FieldValue } from "@google-cloud/firestore";
import { z } from "zod";
import {
  getCareCircleMember,
  deleteCareCircleMember,
  db,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  memberUid: z.string().min(1),
});

export const removeCareCircleMember = functions.https.onCall(async (data, context) => {
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

  const { memberUid } = parsed.data;
  const patientUid = context.auth.uid;

  const member = await getCareCircleMember(patientUid, memberUid);
  if (!member) {
    throw new functions.https.HttpsError(
      "not-found",
      "Member not found in your care circle."
    );
  }

  await deleteCareCircleMember(patientUid, memberUid);

  const sentShares = await db
    .collection("shares")
    .where("senderUid", "==", patientUid)
    .where("status", "==", "accepted")
    .get();

  const sharesToRevoke = sentShares.docs.filter(
    (d) => d.data().recipientUid === memberUid
  );

  if (sharesToRevoke.length > 0) {
    const batch = db.batch();
    for (const shareDoc of sharesToRevoke) {
      const { recordId } = shareDoc.data() as { recordId: string };
      batch.update(shareDoc.ref, { status: "revoked" });
      batch.update(db.collection("records").doc(recordId), {
        [`grants.${memberUid}`]: FieldValue.delete(),
      });
    }
    await batch.commit();
  }

  await writeAuditLog({
    actorUid: patientUid,
    actionType: "careCircle.remove",
    metadata: { memberUid },
  });

  return { memberUid };
});
