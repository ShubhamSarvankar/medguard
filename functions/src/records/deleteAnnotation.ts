import * as functions from "firebase-functions";
import { z } from "zod";
import {
  getAnnotation,
  deleteAnnotation as deleteAnnotationFromDb,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  recordId: z.string().min(1),
  annotationId: z.string().min(1),
});

export const deleteAnnotation = functions.https.onCall(async (data, context) => {
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

  const { recordId, annotationId } = parsed.data;
  const callerUid = context.auth.uid;

  const annotation = await getAnnotation(recordId, annotationId);
  if (!annotation) {
    throw new functions.https.HttpsError("not-found", "Annotation not found.");
  }

  if (annotation.authorUid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only the annotation author can delete it."
    );
  }

  await deleteAnnotationFromDb(recordId, annotationId);

  await writeAuditLog({
    actorUid: callerUid,
    actionType: "annotation.delete",
    recordId,
  });

  return { annotationId };
});
