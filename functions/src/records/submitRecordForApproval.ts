import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require("@google-cloud/firestore") as { Timestamp: typeof import("@google-cloud/firestore").Timestamp };
import { z } from "zod";
import type { MedicalRecord } from "@medguard/types";
import {
  getCareCircleMember,
  getUser,
  setPendingRecord,
  serverTimestamp,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const medicationSchema = z.object({
  name: z.string().min(1),
  doseAmount: z.string().min(1),
  doseUnit: z.string().min(1),
  frequency: z.string().min(1),
});

const diagnosisSchema = z.object({
  code: z.string().min(1),
  description: z.string(),
});

const requestSchema = z.object({
  patientUid: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().default(""),
  visitDate: z.number().positive(),
  medications: z.array(medicationSchema).default([]),
  diagnoses: z.array(diagnosisSchema).default([]),
});

export const submitRecordForApproval = functions.https.onCall(async (data, context) => {
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

  const { patientUid, title, notes, visitDate, medications, diagnoses } = parsed.data;
  const caretakerUid = context.auth.uid;

  if (caretakerUid === patientUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Cannot submit a record for yourself."
    );
  }

  const member = await getCareCircleMember(patientUid, caretakerUid);
  if (!member) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not in this patient's care circle."
    );
  }

  const patient = await getUser(patientUid);
  if (!patient) {
    throw new functions.https.HttpsError("not-found", "Patient not found.");
  }

  const recordId = uuidv4();
  const now = serverTimestamp();
  const visitTs = Timestamp.fromMillis(visitDate) as unknown as FirebaseFirestore.Timestamp;

  const pendingRecord: MedicalRecord = {
    recordId,
    ownerUid: patientUid,
    createdByUid: caretakerUid,
    status: "pending_approval",
    title,
    notes,
    medications: medications.map((m) => ({
      name: m.name,
      doseAmount: m.doseAmount,
      doseUnit: m.doseUnit,
      frequency: m.frequency,
    })),
    diagnoses: diagnoses.map((d) => ({
      code: d.code,
      description: d.description,
      diagnosedAt: visitTs,
    })),
    attachments: [],
    isDeidentified: false,
    createdAt: now,
    updatedAt: now,
    visitDate: visitTs,
  };

  await setPendingRecord(recordId, pendingRecord);

  await writeAuditLog({
    actorUid: caretakerUid,
    actionType: "record.pendingApproval",
    recordId,
  });

  return { recordId };
});
