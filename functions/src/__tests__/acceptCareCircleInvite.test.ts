import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getCareCircleInvite: vi.fn(),
  updateCareCircleInvite: vi.fn(),
  setCareCircleMember: vi.fn(),
  getUser: vi.fn(),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("firebase-functions", () => ({
  https: {
    onCall: (fn: unknown) => fn,
    HttpsError: class HttpsError extends Error {
      constructor(public code: string, message: string) {
        super(message);
      }
    },
  },
  logger: { error: vi.fn() },
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { acceptCareCircleInvite } from "../user/acceptCareCircleInvite";

const PATIENT_UID = "patient-1";
const INVITEE_UID = "invitee-1";
const INVITE_ID = "invite-abc";
const VALID_DATA = { inviteId: INVITE_ID };
const makeContext = (uid: string) => ({ auth: { uid } });

const pendingInvite = {
  inviteId: INVITE_ID,
  patientUid: PATIENT_UID,
  inviteeUid: INVITEE_UID,
  inviteeEmail: "invitee@example.com",
  role: "caretaker" as const,
  status: "pending" as const,
  createdAt: { toDate: () => new Date(), toMillis: () => Date.now() },
};

const inviteeUser = {
  uid: INVITEE_UID,
  displayName: "Invitee User",
  role: "caretaker",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getCareCircleInvite).mockResolvedValue(pendingInvite as never);
  vi.mocked(firestoreAdmin.getUser).mockResolvedValue(inviteeUser as never);
  vi.mocked(firestoreAdmin.updateCareCircleInvite).mockResolvedValue(undefined);
  vi.mocked(firestoreAdmin.setCareCircleMember).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
});

describe("acceptCareCircleInvite", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects missing inviteId", async () => {
    await expect(
      (acceptCareCircleInvite as Function)({}, makeContext(INVITEE_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when invite does not exist", async () => {
    vi.mocked(firestoreAdmin.getCareCircleInvite).mockResolvedValue(null);
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, makeContext(INVITEE_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when invite is not addressed to caller", async () => {
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, makeContext("other-user"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when invite is already accepted", async () => {
    vi.mocked(firestoreAdmin.getCareCircleInvite).mockResolvedValue({
      ...pendingInvite,
      status: "accepted",
    } as never);
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, makeContext(INVITEE_UID))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects when invite is declined", async () => {
    vi.mocked(firestoreAdmin.getCareCircleInvite).mockResolvedValue({
      ...pendingInvite,
      status: "declined",
    } as never);
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, makeContext(INVITEE_UID))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects when user record not found", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue(null);
    await expect(
      (acceptCareCircleInvite as Function)(VALID_DATA, makeContext(INVITEE_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("updates invite to accepted and sets care circle member", async () => {
    const result = await (acceptCareCircleInvite as Function)(
      VALID_DATA,
      makeContext(INVITEE_UID)
    );
    expect(result).toEqual({ inviteId: INVITE_ID, patientUid: PATIENT_UID });
    expect(firestoreAdmin.updateCareCircleInvite).toHaveBeenCalledWith(
      INVITE_ID,
      expect.objectContaining({ status: "accepted" })
    );
    expect(firestoreAdmin.setCareCircleMember).toHaveBeenCalledWith(
      PATIENT_UID,
      INVITEE_UID,
      expect.objectContaining({ uid: INVITEE_UID, role: "caretaker" })
    );
  });

  it("writes audit log with careCircle.accept", async () => {
    await (acceptCareCircleInvite as Function)(VALID_DATA, makeContext(INVITEE_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: INVITEE_UID,
        actionType: "careCircle.accept",
        metadata: expect.objectContaining({ patientUid: PATIENT_UID }),
      })
    );
  });
});
