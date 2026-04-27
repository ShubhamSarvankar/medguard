import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeAuditLog } from "../audit/writeAuditLog";

vi.mock("firebase-functions", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("../lib/firestoreAdmin", () => ({
  writeAuditEntry: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 1700000000, nanoseconds: 0 })),
}));

import { writeAuditEntry } from "../lib/firestoreAdmin";
import * as functions from "firebase-functions";

const mockWriteAuditEntry = vi.mocked(writeAuditEntry);
const mockLoggerError = vi.mocked(functions.logger.error);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Entry shape
// ---------------------------------------------------------------------------

describe("writeAuditLog — entry shape", () => {
  it("writes an entry with all required fields", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-patient-1",
      actionType: "record.create",
    });

    expect(mockWriteAuditEntry).toHaveBeenCalledOnce();
    const entry = mockWriteAuditEntry.mock.calls[0][0];

    expect(typeof entry.entryId).toBe("string");
    expect(entry.entryId.length).toBeGreaterThan(0);
    expect(entry.actorUid).toBe("uid-patient-1");
    expect(entry.actionType).toBe("record.create");
    expect(entry.timestamp).toBeDefined();
  });

  it("generates a unique entryId on each call", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({ actorUid: "uid-1", actionType: "record.read" });
    await writeAuditLog({ actorUid: "uid-1", actionType: "record.read" });

    const id1 = mockWriteAuditEntry.mock.calls[0][0].entryId;
    const id2 = mockWriteAuditEntry.mock.calls[1][0].entryId;
    expect(id1).not.toBe(id2);
  });

  it("includes recordId when provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "record.update",
      recordId: "rec-abc",
    });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry.recordId).toBe("rec-abc");
  });

  it("includes shareId when provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "share.initiate",
      shareId: "share-xyz",
    });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry.shareId).toBe("share-xyz");
  });

  it("includes aiFunction when provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "ai.deidentify",
      recordId: "rec-abc",
      aiFunction: "onRecordWrite",
    });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry.aiFunction).toBe("onRecordWrite");
  });

  it("includes ipHash when provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "auth.login",
      ipHash: "sha256-abc123",
    });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry.ipHash).toBe("sha256-abc123");
  });

  it("includes metadata when provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "share.revoke",
      metadata: { reason: "user_requested" },
    });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry.metadata).toEqual({ reason: "user_requested" });
  });

  it("omits optional fields from entry when not provided", async () => {
    mockWriteAuditEntry.mockResolvedValue(undefined);

    await writeAuditLog({ actorUid: "uid-1", actionType: "auth.logout" });

    const entry = mockWriteAuditEntry.mock.calls[0][0];
    expect(entry).not.toHaveProperty("recordId");
    expect(entry).not.toHaveProperty("shareId");
    expect(entry).not.toHaveProperty("ipHash");
    expect(entry).not.toHaveProperty("aiFunction");
    expect(entry).not.toHaveProperty("metadata");
  });
});

// ---------------------------------------------------------------------------
// Never-throws guarantee
// ---------------------------------------------------------------------------

describe("writeAuditLog — never throws", () => {
  it("does not throw when Firestore write fails", async () => {
    mockWriteAuditEntry.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(
      writeAuditLog({ actorUid: "uid-1", actionType: "record.create" })
    ).resolves.toBeUndefined();
  });

  it("logs the error when Firestore write fails", async () => {
    mockWriteAuditEntry.mockRejectedValue(new Error("Firestore unavailable"));

    await writeAuditLog({
      actorUid: "uid-1",
      actionType: "record.create",
      recordId: "rec-abc",
    });

    expect(mockLoggerError).toHaveBeenCalledOnce();
    const logArgs = mockLoggerError.mock.calls[0];
    expect(logArgs[0]).toBe("writeAuditLog failed");
    expect(logArgs[1]).toMatchObject({
      actionType: "record.create",
      actorUid: "uid-1",
      recordId: "rec-abc",
    });
  });

  it("does not include error message in log output (no PHI leakage risk)", async () => {
    mockWriteAuditEntry.mockRejectedValue(new Error("contains sensitive path info"));

    await writeAuditLog({ actorUid: "uid-1", actionType: "record.delete" });

    const logArgs = mockLoggerError.mock.calls[0][1] as Record<string, unknown>;
    expect(logArgs.error).toBe("Error");
    expect(JSON.stringify(logArgs)).not.toContain("sensitive path info");
  });

  it("does not throw when writeAuditEntry rejects with a non-Error value", async () => {
    mockWriteAuditEntry.mockRejectedValue("string rejection");

    await expect(
      writeAuditLog({ actorUid: "uid-1", actionType: "auth.login" })
    ).resolves.toBeUndefined();
  });

  it("logs UnknownError for non-Error rejections", async () => {
    mockWriteAuditEntry.mockRejectedValue({ code: 503 });

    await writeAuditLog({ actorUid: "uid-1", actionType: "auth.login" });

    const logArgs = mockLoggerError.mock.calls[0][1] as Record<string, unknown>;
    expect(logArgs.error).toBe("UnknownError");
  });
});

// ---------------------------------------------------------------------------
// All AuditActionType values accepted
// ---------------------------------------------------------------------------

describe("writeAuditLog — accepts all AuditActionType values", () => {
  const allActionTypes = [
    "record.create", "record.read", "record.update", "record.delete",
    "record.pendingApproval", "record.approved", "record.rejected",
    "annotation.create", "annotation.update", "annotation.delete",
    "share.initiate", "share.accept", "share.revoke", "share.expire",
    "ai.deidentify", "ai.summarize",
    "auth.login", "auth.logout",
    "careCircle.invite", "careCircle.accept", "careCircle.remove",
    "user.deleteRequest",
  ] as const;

  allActionTypes.forEach((actionType) => {
    it(`accepts actionType: ${actionType}`, async () => {
      mockWriteAuditEntry.mockResolvedValue(undefined);

      await expect(
        writeAuditLog({ actorUid: "uid-1", actionType })
      ).resolves.toBeUndefined();

      const entry = mockWriteAuditEntry.mock.calls[0][0];
      expect(entry.actionType).toBe(actionType);

      vi.clearAllMocks();
    });
  });
});