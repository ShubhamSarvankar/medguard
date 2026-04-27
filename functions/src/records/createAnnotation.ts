import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { RecordAnnotation } from "@medguard/types";
import {
  getRecord,
  getUser,
  setAnnotation,
  serverTimestamp,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  recordId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

export const createAnnotation = functions.https.onCall(async (data, context) => {
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

  const { recordId, text } = parsed.data;
  const clinicianUid = context.auth.uid;

  const [record, user] = await Promise.all([
    getRecord(recordId),
    getUser(clinicianUid),
  ]);

  if (!record) {
    throw new functions.https.HttpsError("not-found", "Record not found.");
  }

  if (!user) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }

  if (user.role !== "clinician") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only clinicians can create annotations."
    );
  }

  const grants = (record as unknown as { grants?: Record<string, boolean> }).grants;
  if (!grants?.[clinicianUid]) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You do not have an accepted share grant for this record."
    );
  }

  const annotationId = uuidv4();
  const now = serverTimestamp();

  const annotation: RecordAnnotation = {
    annotationId,
    recordId,
    authorUid: clinicianUid,
    authorDisplayName: user.displayName,
    text,
    createdAt: now,
  };

  await setAnnotation(recordId, annotationId, annotation);

  await writeAuditLog({
    actorUid: clinicianUid,
    actionType: "annotation.create",
    recordId,
  });

  return { annotationId };
});
