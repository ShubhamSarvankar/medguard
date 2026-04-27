import * as functions from "firebase-functions";
import { z } from "zod";
import {
  getPendingRecord,
  db,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  recordId: z.string().min(1),
});

export const approveRecord = functions.https.onCall(async (data, context) => {
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

  const { recordId } = parsed.data;
  const patientUid = context.auth.uid;

  const pendingRecord = await getPendingRecord(recordId);
  if (!pendingRecord) {
    throw new functions.https.HttpsError("not-found", "Pending record not found.");
  }

  if (pendingRecord.ownerUid !== patientUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not the owner of this record."
    );
  }

  if (pendingRecord.status !== "pending_approval") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Record is not awaiting approval."
    );
  }

  const approvedRecord = {
    ...pendingRecord,
    status: "active" as const,
    isDeidentified: false,
  };

  const batch = db.batch();
  batch.set(db.collection("records").doc(recordId), approvedRecord);
  batch.delete(db.collection("pendingRecords").doc(recordId));
  await batch.commit();

  await writeAuditLog({
    actorUid: patientUid,
    actionType: "record.approved",
    recordId,
  });

  return { recordId };
});
