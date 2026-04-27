import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getRecord: vi.fn(),
  getUser: vi.fn(),
  setAnnotation: vi.fn(),
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
import { createAnnotation } from "../records/createAnnotation";

const CLINICIAN_UID = "clinician-1";
const RECORD_ID = "rec-1";

const mockRecord = {
  recordId: RECORD_ID,
  ownerUid: "patient-1",
  grants: { [CLINICIAN_UID]: true },
};

const mockClinician = {
  uid: CLINICIAN_UID,
  displayName: "Dr. Smith",
  role: "clinician",
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getRecord).mockResolvedValue(mockRecord as never);
  vi.mocked(firestoreAdmin.getUser).mockResolvedValue(mockClinician as never);
  vi.mocked(firestoreAdmin.setAnnotation).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
});

describe("createAnnotation", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (createAnnotation as Function)({ recordId: RECORD_ID, text: "Note" }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid schema (missing text)", async () => {
    await expect(
      (createAnnotation as Function)({ recordId: RECORD_ID }, makeContext(CLINICIAN_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when record not found", async () => {
    vi.mocked(firestoreAdmin.getRecord).mockResolvedValue(null);
    await expect(
      (createAnnotation as Function)(
        { recordId: RECORD_ID, text: "Note" },
        makeContext(CLINICIAN_UID)
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when user not found", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue(null);
    await expect(
      (createAnnotation as Function)(
        { recordId: RECORD_ID, text: "Note" },
        makeContext(CLINICIAN_UID)
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when user role is not clinician", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue({ ...mockClinician, role: "caretaker" } as never);
    await expect(
      (createAnnotation as Function)(
        { recordId: RECORD_ID, text: "Note" },
        makeContext(CLINICIAN_UID)
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when clinician has no accepted share grant", async () => {
    vi.mocked(firestoreAdmin.getRecord).mockResolvedValue({
      ...mockRecord,
      grants: {},
    } as never);
    await expect(
      (createAnnotation as Function)(
        { recordId: RECORD_ID, text: "Note" },
        makeContext(CLINICIAN_UID)
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when grants map is absent", async () => {
    vi.mocked(firestoreAdmin.getRecord).mockResolvedValue({
      ...mockRecord,
      grants: undefined,
    } as never);
    await expect(
      (createAnnotation as Function)(
        { recordId: RECORD_ID, text: "Note" },
        makeContext(CLINICIAN_UID)
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("creates annotation and returns annotationId", async () => {
    const result = await (createAnnotation as Function)(
      { recordId: RECORD_ID, text: "Patient is improving." },
      makeContext(CLINICIAN_UID)
    );
    expect(result.annotationId).toBeDefined();
    expect(firestoreAdmin.setAnnotation).toHaveBeenCalledOnce();
    const [, , annotation] = vi.mocked(firestoreAdmin.setAnnotation).mock.calls[0];
    expect(annotation.authorUid).toBe(CLINICIAN_UID);
    expect(annotation.authorDisplayName).toBe("Dr. Smith");
    expect(annotation.text).toBe("Patient is improving.");
    expect(annotation.recordId).toBe(RECORD_ID);
  });

  it("writes audit log with annotation.create", async () => {
    await (createAnnotation as Function)(
      { recordId: RECORD_ID, text: "Note" },
      makeContext(CLINICIAN_UID)
    );
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: CLINICIAN_UID,
        actionType: "annotation.create",
        recordId: RECORD_ID,
      })
    );
  });
});
