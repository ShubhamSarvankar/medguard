import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require("@google-cloud/firestore") as { Timestamp: typeof import("@google-cloud/firestore").Timestamp };
import { z } from "zod";
import type { DeletionRequest } from "@medguard/types";
import { db, setDeletionRequest, serverTimestamp } from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const CONFIRM_PHRASE = "DELETE MY DATA";
const DELETION_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const requestSchema = z.object({
  uid: z.string().min(1),
  confirmPhrase: z.string(),
});

export const deleteUserData = functions.https.onCall(async (data, context) => {
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

  const { uid, confirmPhrase } = parsed.data;
  const callerUid = context.auth.uid;

  if (uid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You can only delete your own data."
    );
  }

  if (confirmPhrase !== CONFIRM_PHRASE) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Confirm phrase must be "${CONFIRM_PHRASE}".`
    );
  }

  const existingSnap = await db
    .collection("deletionRequests")
    .where("uid", "==", callerUid)
    .where("processed", "==", false)
    .get();

  if (!existingSnap.empty) {
    throw new functions.https.HttpsError(
      "already-exists",
      "A deletion request is already pending for this account."
    );
  }

  const deletionRequestId = uuidv4();
  const requestedAt = serverTimestamp();
  const scheduledFor = Timestamp.fromMillis(
    Date.now() + DELETION_DELAY_MS
  ) as unknown as FirebaseFirestore.Timestamp;

  const deletionRequest: DeletionRequest = {
    deletionRequestId,
    uid: callerUid,
    requestedAt,
    scheduledFor,
    processed: false,
  };

  await setDeletionRequest(deletionRequestId, deletionRequest);

  await writeAuditLog({
    actorUid: callerUid,
    actionType: "user.deleteRequest",
    metadata: { deletionRequestId },
  });

  return {
    deletionRequestId,
    scheduledFor: scheduledFor.toDate().toISOString(),
  };
});
