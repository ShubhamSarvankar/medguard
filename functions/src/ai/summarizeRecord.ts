import * as functions from "firebase-functions";
import * as crypto from "crypto";
import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import type { MedicalRecord, ShareGrant } from "@medguard/types";
import { getRecord, db } from "../lib/firestoreAdmin";
import { unwrapDataKey } from "../lib/kmsClient";
import { invokeModel, MODEL_ID } from "../lib/bedrockClient";
import { writeAuditLog } from "../audit/writeAuditLog";
import { checkRateLimit } from "../lib/rateLimiter";

const DISCLAIMER =
  "This summary is AI-generated and does not substitute professional clinical advice.";

const requestSchema = z.object({
  recordId: z.string().min(1),
});

interface SummarizeRecordResponse {
  summary: string;
  modelId: string;
  generatedAt: string;
  disclaimer: string;
}

async function callerHasReadAccess(
  uid: string,
  record: MedicalRecord,
  recordId: string
): Promise<boolean> {
  if (record.ownerUid === uid) return true;

  const now = Timestamp.now();

  const grantsSnap = await db
    .collection("shares")
    .where("recordId", "==", recordId)
    .where("recipientUid", "==", uid)
    .where("status", "==", "accepted")
    .get();

  return grantsSnap.docs.some((doc) => {
    const grant = doc.data() as ShareGrant;
    if (grant.expiry === "permanent") return true;
    return grant.expiresAt !== undefined && grant.expiresAt.seconds > now.seconds;
  });
}

// blob format: base64(iv[12] + ciphertext + authTag[16])
function decryptFields(encryptedFields: string, dataKey: Buffer): Partial<MedicalRecord> {
  const blob = Buffer.from(encryptedFields, "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as Partial<MedicalRecord>;
}

function buildPrompt(record: MedicalRecord): string {
  const lines: string[] = [
    `Title: ${record.title ?? "(no title)"}`,
    `Visit date: ${new Date(record.visitDate.seconds * 1000).toDateString()}`,
  ];

  if (record.notes) {
    lines.push(`Notes: ${record.notes}`);
  }

  if (record.vitals) {
    const v = record.vitals;
    const vitalParts: string[] = [];
    if (v.bloodPressureSystolic !== undefined && v.bloodPressureDiastolic !== undefined) {
      vitalParts.push(`BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg`);
    }
    if (v.heartRateBpm !== undefined) vitalParts.push(`HR ${v.heartRateBpm} bpm`);
    if (v.weightKg !== undefined) vitalParts.push(`weight ${v.weightKg} kg`);
    if (v.temperatureCelsius !== undefined) vitalParts.push(`temp ${v.temperatureCelsius}°C`);
    if (vitalParts.length > 0) lines.push(`Vitals: ${vitalParts.join(", ")}`);
  }

  if (record.medications?.length) {
    const meds = record.medications
      .map((m) => `${m.name} ${m.doseAmount} ${m.doseUnit} ${m.frequency}`)
      .join("; ");
    lines.push(`Medications: ${meds}`);
  }

  if (record.diagnoses?.length) {
    const diags = record.diagnoses
      .map((d) => `${d.code} ${d.description}`)
      .join("; ");
    lines.push(`Diagnoses: ${diags}`);
  }

  return (
    "You are a clinical documentation assistant. Summarize the following " +
    "de-identified medical record in plain language suitable for a patient " +
    "or non-clinical caregiver. Be concise and factual. Do not infer, " +
    "diagnose, or recommend.\n\n" +
    lines.join("\n")
  );
}

export const summarizeRecord = functions.https.onCall(
  async (data, context): Promise<SummarizeRecordResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const callerUid = context.auth.uid;

    // T10: 50 requests/user/day.
    await checkRateLimit(callerUid, "summarizeRecord", 50, 24 * 60 * 60 * 1000);

    const parsed = requestSchema.safeParse(data);
    if (!parsed.success) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "recordId is required."
      );
    }

    const { recordId } = parsed.data;

    const record = await getRecord(recordId);
    if (!record) {
      throw new functions.https.HttpsError(
        "not-found",
        "Record not found."
      );
    }

    const hasAccess = await callerHasReadAccess(callerUid, record, recordId);
    if (!hasAccess) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have access to this record."
      );
    }

    // Decrypt server-side: Cloud Function is a KMS-trusted principal; client never sees the data key.
    if (record.encryptedFields && record.wrappedDataKey) {
      try {
        const wrappedKeyBuffer = Buffer.from(record.wrappedDataKey, "base64");
        const dataKey = await unwrapDataKey(record.ownerUid, wrappedKeyBuffer);
        const decryptedFields = decryptFields(record.encryptedFields, dataKey);
        Object.assign(record, decryptedFields);
      } catch (err) {
        functions.logger.error("summarizeRecord: decryption failed", {
          recordId,
          error: err instanceof Error ? err.constructor.name : "UnknownError",
        });
        throw new functions.https.HttpsError(
          "internal",
          "Failed to decrypt record fields."
        );
      }
    }

    let rawSummary: string;
    try {
      const prompt = buildPrompt(record);
      rawSummary = await invokeModel(prompt);
    } catch (err) {
      functions.logger.error("summarizeRecord: Bedrock invocation failed", {
        recordId,
        error: err instanceof Error ? err.constructor.name : "UnknownError",
      });
      throw new functions.https.HttpsError(
        "unavailable",
        "Summary service is temporarily unavailable."
      );
    }

    if (!rawSummary || rawSummary.trim().length === 0) {
      throw new functions.https.HttpsError(
        "internal",
        "Summary service returned an empty response."
      );
    }

    const generatedAt = new Date().toISOString();

    await writeAuditLog({
      actorUid: callerUid,
      actionType: "ai.summarize",
      recordId,
      aiFunction: "summarizeRecord",
      metadata: { modelId: MODEL_ID },
    });

    return {
      summary: rawSummary,
      modelId: MODEL_ID,
      generatedAt,
      disclaimer: DISCLAIMER,
    };
  }
);
