import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatch = {
  set: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../lib/firestoreAdmin", () => ({
  getPendingRecord: vi.fn(),
  db: {
    batch: vi.fn(() => mockBatch),
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({})),
    })),
  },
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
import { approveRecord } from "../records/approveRecord";

const PATIENT_UID = "patient-1";
const CARETAKER_UID = "caretaker-1";
const RECORD_ID = "rec-pending-1";

const mockPendingRecord = {
  recordId: RECORD_ID,
  ownerUid: PATIENT_UID,
  createdByUid: CARETAKER_UID,
  status: "pending_approval",
  title: "Visit",
  notes: "",
  medications: [],
  diagnoses: [],
  attachments: [],
  isDeidentified: false,
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getPendingRecord).mockResolvedValue(mockPendingRecord as never);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
  mockBatch.set.mockClear();
  mockBatch.delete.mockClear();
  mockBatch.commit.mockResolvedValue(undefined);
});

describe("approveRecord", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (approveRecord as Function)({ recordId: RECORD_ID }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid schema (missing recordId)", async () => {
    await expect(
      (approveRecord as Function)({}, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when pending record not found", async () => {
    vi.mocked(firestoreAdmin.getPendingRecord).mockResolvedValue(null);
    await expect(
      (approveRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when caller is not the owner", async () => {
    await expect(
      (approveRecord as Function)({ recordId: RECORD_ID }, makeContext("other-user"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when record is not in pending_approval status", async () => {
    vi.mocked(firestoreAdmin.getPendingRecord).mockResolvedValue({
      ...mockPendingRecord,
      status: "active",
    } as never);
    await expect(
      (approveRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("commits batch and returns recordId on success", async () => {
    const result = await (approveRecord as Function)(
      { recordId: RECORD_ID },
      makeContext(PATIENT_UID)
    );
    expect(result.recordId).toBe(RECORD_ID);
    expect(mockBatch.set).toHaveBeenCalledOnce();
    expect(mockBatch.delete).toHaveBeenCalledOnce();
    expect(mockBatch.commit).toHaveBeenCalledOnce();
  });

  it("approved record has status active and isDeidentified false", async () => {
    await (approveRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID));
    const setCall = mockBatch.set.mock.calls[0];
    const approvedRecord = setCall[1];
    expect(approvedRecord.status).toBe("active");
    expect(approvedRecord.isDeidentified).toBe(false);
  });

  it("writes audit log with record.approved", async () => {
    await (approveRecord as Function)({ recordId: RECORD_ID }, makeContext(PATIENT_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUid: PATIENT_UID, actionType: "record.approved", recordId: RECORD_ID })
    );
  });
});
