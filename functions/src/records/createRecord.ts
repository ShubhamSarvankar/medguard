import * as functions from "firebase-functions";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require("@google-cloud/firestore") as {
  Timestamp: typeof import("@google-cloud/firestore").Timestamp;
};
import type { MedicalRecord, Vitals } from "@medguard/types";
import { setRecord, serverTimestamp } from "../lib/firestoreAdmin";
import { deidentifyFields } from "../pipeline/phiDeidentifier";
import { writeAuditLog } from "../audit/writeAuditLog";
import { wrapDataKey } from "../lib/kmsClient";

const medicationSchema = z.object({
  name: z.string().min(1),
  doseAmount: z.string().min(1),
  doseUnit: z.string().min(1),
  frequency: z.string().min(1),
});

const diagnosisSchema = z.object({
  code: z.string().min(1),
  description: z.string().default(""),
  diagnosedAt: z.number().positive(),
});

const vitalsSchema = z
  .object({
    bloodPressureSystolic: z.number().optional(),
    bloodPressureDiastolic: z.number().optional(),
    heartRateBpm: z.number().optional(),
    weightKg: z.number().optional(),
    temperatureCelsius: z.number().optional(),
  })
  .optional();

const requestSchema = z.object({
  recordId: z.string().min(1),
  title: z.string().min(1).max(200),
  notes: z.string().max(10000).default(""),
  visitDate: z.number().positive(),
  vitals: vitalsSchema,
  medications: z.array(medicationSchema).max(50).default([]),
  diagnoses: z.array(diagnosisSchema).max(50).default([]),
});

export const createRecord = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }

  const { recordId, title, notes, visitDate, vitals, medications, diagnoses } = parsed.data;
  const ownerUid = context.auth.uid;

  const fieldsToProcess: Record<string, string> = { title, notes };
  medications.forEach((med, i) => {
    fieldsToProcess[`medication_name_${i}`] = med.name;
  });
  diagnoses.forEach((diag, i) => {
    fieldsToProcess[`diagnosis_description_${i}`] = diag.description;
  });

  const deidentified = await deidentifyFields(fieldsToProcess);

  const now = serverTimestamp();
  const visitTs = Timestamp.fromMillis(
    visitDate * 1000,
  ) as unknown as FirebaseFirestore.Timestamp;

  let vitalsData: Vitals | undefined;
  if (vitals) {
    vitalsData = {
      recordedAt: now,
      ...(vitals.bloodPressureSystolic !== undefined && {
        bloodPressureSystolic: vitals.bloodPressureSystolic,
      }),
      ...(vitals.bloodPressureDiastolic !== undefined && {
        bloodPressureDiastolic: vitals.bloodPressureDiastolic,
      }),
      ...(vitals.heartRateBpm !== undefined && {
        heartRateBpm: vitals.heartRateBpm,
      }),
      ...(vitals.weightKg !== undefined && { weightKg: vitals.weightKg }),
      ...(vitals.temperatureCelsius !== undefined && {
        temperatureCelsius: vitals.temperatureCelsius,
      }),
    };
  }

  const record: MedicalRecord = {
    recordId,
    ownerUid,
    createdByUid: ownerUid,
    status: "active",
    // isDeidentified: true prevents onRecordWrite from re-processing this record on subsequent writes.
    isDeidentified: true,
    title: deidentified.title ?? title,
    notes: deidentified.notes ?? notes,
    medications: medications.map((m, i) => ({
      name: deidentified[`medication_name_${i}`] ?? m.name,
      doseAmount: m.doseAmount,
      doseUnit: m.doseUnit,
      frequency: m.frequency,
    })),
    diagnoses: diagnoses.map((d, i) => ({
      code: d.code,
      description: deidentified[`diagnosis_description_${i}`] ?? d.description,
      diagnosedAt: Timestamp.fromMillis(
        d.diagnosedAt * 1000,
      ) as unknown as FirebaseFirestore.Timestamp,
    })),
    attachments: [],
    visitDate: visitTs,
    createdAt: now,
    updatedAt: now,
    ...(vitalsData !== undefined && { vitals: vitalsData }),
  };

  const dataKey = require("crypto").randomBytes(32);
  const wrappedDataKey = (await wrapDataKey(ownerUid, dataKey)).toString("base64");
  record.wrappedDataKey = wrappedDataKey;

  await setRecord(recordId, record);

  await writeAuditLog({
    actorUid: ownerUid,
    actionType: "record.create",
    recordId,
  });

  return { recordId };
});