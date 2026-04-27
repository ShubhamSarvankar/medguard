import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getPendingRecord: vi.fn(),
  deletePendingRecord: vi.fn(),
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
import { rejectRecord } from "../records/rejectRecord";

const PATIENT_UID = "patient-1";
const CARETAKER_UID = "caretaker-1";
const RECORD_ID = "rec-pending-1";

const mockPendingRecord = {
  recordId: RECORD_ID,
  ownerUid: PATIENT_UID,
  createdByUid: CARETAKER_UID,
  status: "pending_approval",
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getPendingRecord).mockResolvedValue(mockPendingRecord as never);
  vi.mocked(firestoreAdmin.deletePendingRecord).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
});

describe("rejectRecord", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (rejectRecord as Function)({ recordId: RECORD_ID }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid schema (missing recordId)", async () => {
    await expect(
      (rejectRecord as Function)({}, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when pending record not found", async () => {
    vi.mocked(firestoreAdmin.getPendingRecord).mockResolvedValue(null);
    await expect(
      (rejectRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when caller is not the owner", async () => {
    await expect(
      (rejectRecord as Function)({ recordId: RECORD_ID }, makeContext("other-user"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("deletes pending record and returns recordId on success", async () => {
    const result = await (rejectRecord as Function)(
      { recordId: RECORD_ID },
      makeContext(PATIENT_UID)
    );
    expect(result.recordId).toBe(RECORD_ID);
    expect(firestoreAdmin.deletePendingRecord).toHaveBeenCalledWith(RECORD_ID);
  });

  it("writes audit log with record.rejected", async () => {
    await (rejectRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUid: PATIENT_UID, actionType: "record.rejected", recordId: RECORD_ID })
    );
  });
});
