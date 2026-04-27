import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { CareCircleInvite } from "@medguard/types";
import {
  getUser,
  getCareCircleMember,
  setCareCircleInvite,
  serverTimestamp,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  inviteeEmail: z.string().email(),
  role: z.enum(["caretaker", "clinician"]),
});

export const inviteToCareCircle = functions.https.onCall(async (data, context) => {
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

  const { inviteeEmail, role } = parsed.data;
  const patientUid = context.auth.uid;

  const caller = await getUser(patientUid);
  if (!caller) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }

  if (caller.role !== "patient") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only patients can invite care circle members."
    );
  }

  if (caller.email === inviteeEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot invite yourself.");
  }

  let inviteeUid: string;
  try {
    const inviteeRecord = await admin.auth().getUserByEmail(inviteeEmail);
    inviteeUid = inviteeRecord.uid;
  } catch {
    throw new functions.https.HttpsError(
      "not-found",
      "No registered user found with this email address."
    );
  }

  const existingMember = await getCareCircleMember(patientUid, inviteeUid);
  if (existingMember) {
    throw new functions.https.HttpsError(
      "already-exists",
      "This user is already in your care circle."
    );
  }

  const inviteId = uuidv4();
  const now = serverTimestamp();

  const invite: CareCircleInvite = {
    inviteId,
    patientUid,
    inviteeEmail,
    inviteeUid,
    role,
    status: "pending",
    createdAt: now,
  };

  await setCareCircleInvite(inviteId, invite);

  await writeAuditLog({
    actorUid: patientUid,
    actionType: "careCircle.invite",
    metadata: { inviteeUid, role },
  });

  return { inviteId };
});
