import * as functions from "firebase-functions";
import * as crypto from "crypto";
import { FieldValue } from "@google-cloud/firestore";
import type { MedicalRecord, Medication, Diagnosis } from "@medguard/types";
import { deidentifyFields } from "./phiDeidentifier";
import { wrapDataKey } from "../lib/kmsClient";
import { writeAuditLog } from "../audit/writeAuditLog";
import { db } from "../lib/firestoreAdmin";

// Returns base64(iv[12] + ciphertext + authTag[16])
function encryptFields(fields: Record<string, unknown>, dataKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
  const plaintext = Buffer.from(JSON.stringify(fields));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export const onRecordWrite = functions.firestore
  .document("records/{recordId}")
  .onWrite(async (change, context) => {
    const { recordId } = context.params;

    if (!change.after.exists) return;

    const record = change.after.data() as MedicalRecord;

    // Guard against re-processing on subsequent writes after de-identification
    if (record.isDeidentified) return;

    try {
      const fieldsToProcess: Record<string, string> = {
        title: record.title ?? "",
        notes: record.notes ?? "",
      };

      (record.medications ?? []).forEach((med: Medication, i: number) => {
        fieldsToProcess[`medication_name_${i}`] = med.name ?? "";
        fieldsToProcess[`medication_dose_${i}`] = med.doseAmount ?? "";
      });

      (record.diagnoses ?? []).forEach((diag: Diagnosis, i: number) => {
        fieldsToProcess[`diagnosis_description_${i}`] = diag.description ?? "";
      });

      const deidentified = await deidentifyFields(fieldsToProcess);

      const updatedMedications: Medication[] = (record.medications ?? []).map(
        (med: Medication, i: number) => ({
          ...med,
          name: deidentified[`medication_name_${i}`] ?? med.name,
          doseAmount: deidentified[`medication_dose_${i}`] ?? med.doseAmount,
        })
      );

      const updatedDiagnoses: Diagnosis[] = (record.diagnoses ?? []).map(
        (diag: Diagnosis, i: number) => ({
          ...diag,
          description:
            deidentified[`diagnosis_description_${i}`] ?? diag.description,
        })
      );

      // T03: fields are removed from the top-level document so Firestore stores only ciphertext.
      const sensitiveFields: Record<string, unknown> = {
        title: deidentified.title ?? record.title,
        notes: deidentified.notes ?? record.notes,
        medications: updatedMedications,
        diagnoses: updatedDiagnoses,
      };
      if (record.vitals !== undefined) sensitiveFields.vitals = record.vitals;
      if ((record.attachments ?? []).length > 0) {
        sensitiveFields.attachments = record.attachments;
      }

      const dataKey = crypto.randomBytes(32);
      const encryptedFields = encryptFields(sensitiveFields, dataKey);
      const wrappedKey = await wrapDataKey(record.ownerUid, dataKey);
      const wrappedDataKey = wrappedKey.toString("base64");

      // Cast required: FieldValue.delete() is not assignable to MedicalRecord field types but is a valid Firestore update sentinel.
      await db.collection("records").doc(recordId).update({
        encryptedFields,
        wrappedDataKey,
        isDeidentified: true,
        title: FieldValue.delete(),
        notes: FieldValue.delete(),
        medications: FieldValue.delete(),
        diagnoses: FieldValue.delete(),
        vitals: FieldValue.delete(),
        attachments: FieldValue.delete(),
      } as Record<string, unknown>);

      await writeAuditLog({
        actorUid: record.ownerUid,
        actionType: "ai.deidentify",
        recordId,
        aiFunction: "onRecordWrite",
      });
    } catch (err) {
      const errorCode =
        err instanceof Error ? err.constructor.name : "UnknownError";

      functions.logger.error("PHI de-identification or encryption failed", {
        recordId,
        errorCode,
      });

      // Delete the document on failure so no unredacted PHI persists.
      await db
        .collection("records")
        .doc(recordId)
        .delete()
        .catch((deleteErr) => {
          functions.logger.error("Rollback delete failed", {
            recordId,
            errorCode:
              deleteErr instanceof Error
                ? deleteErr.constructor.name
                : "UnknownError",
          });
        });
    }
  });
