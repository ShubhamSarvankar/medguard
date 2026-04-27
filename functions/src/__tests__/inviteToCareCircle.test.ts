import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuthInstance } = vi.hoisted(() => {
  const mockAuthInstance = {
    getUserByEmail: vi.fn(),
    deleteUser: vi.fn(),
  };
  return { mockAuthInstance };
});

vi.mock("../lib/firestoreAdmin", () => ({
  getUser: vi.fn(),
  getCareCircleMember: vi.fn(),
  setCareCircleInvite: vi.fn(),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  auth: vi.fn(() => mockAuthInstance),
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

vi.mock("uuid", () => ({
  v4: vi.fn(() => "invite-uuid-1"),
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { inviteToCareCircle } from "../user/inviteToCareCircle";

const PATIENT_UID = "patient-1";
const INVITEE_UID = "invitee-1";
const INVITEE_EMAIL = "invitee@example.com";
const VALID_DATA = { inviteeEmail: INVITEE_EMAIL, role: "caretaker" as const };
const makeContext = (uid: string) => ({ auth: { uid } });

const patientUser = {
  uid: PATIENT_UID,
  email: "patient@example.com",
  role: "patient",
  displayName: "Patient User",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getUser).mockResolvedValue(patientUser as never);
  vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue(null);
  vi.mocked(firestoreAdmin.setCareCircleInvite).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
  mockAuthInstance.getUserByEmail.mockResolvedValue({ uid: INVITEE_UID });
});

describe("inviteToCareCircle", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (inviteToCareCircle as Function)(VALID_DATA, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid email", async () => {
    await expect(
      (inviteToCareCircle as Function)(
        { inviteeEmail: "not-an-email", role: "caretaker" },
        makeContext(PATIENT_UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects invalid role", async () => {
    await expect(
      (inviteToCareCircle as Function)(
        { inviteeEmail: INVITEE_EMAIL, role: "admin" },
        makeContext(PATIENT_UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when caller is not a patient", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue({
      ...patientUser,
      role: "clinician",
    } as never);
    await expect(
      (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects self-invite", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue({
      ...patientUser,
      email: INVITEE_EMAIL,
    } as never);
    await expect(
      (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when invitee is not registered", async () => {
    mockAuthInstance.getUserByEmail.mockRejectedValue(new Error("auth/user-not-found"));
    await expect(
      (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when invitee is already a care circle member", async () => {
    vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue({ uid: INVITEE_UID } as never);
    await expect(
      (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "already-exists" });
  });

  it("creates invite and returns inviteId", async () => {
    const result = await (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID));
    expect(result).toEqual({ inviteId: "invite-uuid-1" });
    expect(firestoreAdmin.setCareCircleInvite).toHaveBeenCalledOnce();
    const [savedId, savedInvite] = vi.mocked(firestoreAdmin.setCareCircleInvite).mock.calls[0];
    expect(savedId).toBe("invite-uuid-1");
    expect(savedInvite.patientUid).toBe(PATIENT_UID);
    expect(savedInvite.inviteeUid).toBe(INVITEE_UID);
    expect(savedInvite.role).toBe("caretaker");
    expect(savedInvite.status).toBe("pending");
  });

  it("writes audit log with careCircle.invite", async () => {
    await (inviteToCareCircle as Function)(VALID_DATA, makeContext(PATIENT_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUid: PATIENT_UID, actionType: "careCircle.invite" })
    );
  });

  it("accepts clinician role", async () => {
    const result = await (inviteToCareCircle as Function)(
      { inviteeEmail: INVITEE_EMAIL, role: "clinician" },
      makeContext(PATIENT_UID)
    );
    expect(result.inviteId).toBeDefined();
    const [, savedInvite] = vi.mocked(firestoreAdmin.setCareCircleInvite).mock.calls[0];
    expect(savedInvite.role).toBe("clinician");
  });
});
