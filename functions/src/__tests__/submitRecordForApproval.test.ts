import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getCareCircleMember: vi.fn(),
  getUser: vi.fn(),
  setPendingRecord: vi.fn(),
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

vi.mock("@google-cloud/firestore", () => ({
  Timestamp: {
    fromMillis: vi.fn((ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms })),
    now: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
  },
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { submitRecordForApproval } from "../records/submitRecordForApproval";

const CARETAKER_UID = "caretaker-1";
const PATIENT_UID = "patient-1";

const mockMember = { uid: CARETAKER_UID, displayName: "Caretaker", role: "caretaker" };
const mockPatient = { uid: PATIENT_UID, displayName: "Patient", email: "p@test.com", role: "patient" };

const validData = {
  patientUid: PATIENT_UID,
  title: "Visit 1",
  notes: "Some notes",
  visitDate: Date.now(),
  medications: [],
  diagnoses: [],
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue(mockMember as never);
  vi.mocked(firestoreAdmin.getUser).mockResolvedValue(mockPatient as never);
  vi.mocked(firestoreAdmin.setPendingRecord).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
});

describe("submitRecordForApproval", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (submitRecordForApproval as Function)(validData, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid schema (missing title)", async () => {
    await expect(
      (submitRecordForApproval as Function)(
        { patientUid: PATIENT_UID, visitDate: Date.now() },
        makeContext(CARETAKER_UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects self-submission", async () => {
    await expect(
      (submitRecordForApproval as Function)(
        { ...validData, patientUid: CARETAKER_UID },
        makeContext(CARETAKER_UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when caretaker not in care circle", async () => {
    vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue(null);
    await expect(
      (submitRecordForApproval as Function)(validData, makeContext(CARETAKER_UID))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when patient not found", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue(null);
    await expect(
      (submitRecordForApproval as Function)(validData, makeContext(CARETAKER_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("creates pending record and returns recordId", async () => {
    const result = await (submitRecordForApproval as Function)(
      validData,
      makeContext(CARETAKER_UID)
    );
    expect(result.recordId).toBeDefined();
    expect(typeof result.recordId).toBe("string");
    expect(firestoreAdmin.setPendingRecord).toHaveBeenCalledOnce();
    const [, savedRecord] = vi.mocked(firestoreAdmin.setPendingRecord).mock.calls[0];
    expect(savedRecord.ownerUid).toBe(PATIENT_UID);
    expect(savedRecord.createdByUid).toBe(CARETAKER_UID);
    expect(savedRecord.status).toBe("pending_approval");
    expect(savedRecord.isDeidentified).toBe(false);
  });

  it("writes audit log with record.pendingApproval", async () => {
    await (submitRecordForApproval as Function)(validData, makeContext(CARETAKER_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUid: CARETAKER_UID, actionType: "record.pendingApproval" })
    );
  });

  it("maps medications and diagnoses into the pending record", async () => {
    const dataWithItems = {
      ...validData,
      medications: [{ name: "Metformin", doseAmount: "500", doseUnit: "mg", frequency: "daily" }],
      diagnoses: [{ code: "E11", description: "Type 2 diabetes" }],
    };
    await (submitRecordForApproval as Function)(dataWithItems, makeContext(CARETAKER_UID));
    const [, savedRecord] = vi.mocked(firestoreAdmin.setPendingRecord).mock.calls[0];
    expect(savedRecord.medications).toHaveLength(1);
    expect(savedRecord.medications[0].name).toBe("Metformin");
    expect(savedRecord.diagnoses).toHaveLength(1);
    expect(savedRecord.diagnoses[0].code).toBe("E11");
  });
});
