import * as functions from "firebase-functions";
import { z } from "zod";
import type { CareCircleMember } from "@medguard/types";
import {
  getCareCircleInvite,
  updateCareCircleInvite,
  setCareCircleMember,
  getUser,
  serverTimestamp,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  inviteId: z.string().min(1),
});

export const acceptCareCircleInvite = functions.https.onCall(async (data, context) => {
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

  const { inviteId } = parsed.data;
  const callerUid = context.auth.uid;

  const invite = await getCareCircleInvite(inviteId);
  if (!invite) {
    throw new functions.https.HttpsError("not-found", "Invite not found.");
  }

  if (invite.inviteeUid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "This invite is not addressed to you."
    );
  }

  if (invite.status !== "pending") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Invite is already ${invite.status}.`
    );
  }

  const caller = await getUser(callerUid);
  if (!caller) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }

  const now = serverTimestamp();

  const member: CareCircleMember = {
    uid: callerUid,
    displayName: caller.displayName,
    role: invite.role,
    grantedAt: now,
    grantedBy: invite.patientUid,
  };

  await Promise.all([
    updateCareCircleInvite(inviteId, { status: "accepted", acceptedAt: now }),
    setCareCircleMember(invite.patientUid, callerUid, member),
  ]);

  await writeAuditLog({
    actorUid: callerUid,
    actionType: "careCircle.accept",
    metadata: { patientUid: invite.patientUid, role: invite.role },
  });

  return { inviteId, patientUid: invite.patientUid };
});
