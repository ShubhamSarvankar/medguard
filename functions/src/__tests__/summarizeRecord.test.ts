import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase-functions", () => {
  const HttpsError = class extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  };
  return {
    https: { onCall: (fn: unknown) => fn, HttpsError },
    logger: { error: vi.fn() },
  };
});

vi.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: vi.fn(() => ({ seconds: 1700000000, nanoseconds: 0 })),
    },
  },
}));

vi.mock("../lib/firestoreAdmin", () => ({
  getRecord: vi.fn(),
  db: {
    collection: vi.fn(),
  },
}));

vi.mock("../lib/bedrockClient", () => ({
  invokeModel: vi.fn(),
  MODEL_ID: "anthropic.claude-sonnet-4-5-mock",
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { summarizeRecord } from "../ai/summarizeRecord";
import { getRecord, db } from "../lib/firestoreAdmin";
import { invokeModel } from "../lib/bedrockClient";
import { writeAuditLog } from "../audit/writeAuditLog";
import * as functions from "firebase-functions";

const mockGetRecord = vi.mocked(getRecord);
const mockInvokeModel = vi.mocked(invokeModel);
const mockWriteAuditLog = vi.mocked(writeAuditLog);
const mockLoggerError = vi.mocked(functions.logger.error);
const mockDb = vi.mocked(db);

const DISCLAIMER =
  "This summary is AI-generated and does not substitute professional clinical advice.";

function makeContext(uid: string) {
  return { auth: { uid, token: {} } };
}

function makeRecord(overrides = {}) {
  return {
    recordId: "rec-1",
    ownerUid: "uid-owner",
    createdByUid: "uid-owner",
    status: "active",
    title: "Routine checkup",
    notes: "Patient reports mild fatigue.",
    medications: [],
    diagnoses: [],
    attachments: [],
    isDeidentified: true,
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    updatedAt: { seconds: 1700000000, nanoseconds: 0 },
    visitDate: { seconds: 1700000000, nanoseconds: 0 },
    ...overrides,
  };
}

function mockOwnerAccess() {
  mockGetRecord.mockResolvedValue(makeRecord() as never);
}

function mockSharedAccess(uid: string) {
  mockGetRecord.mockResolvedValue(makeRecord({ ownerUid: "uid-other" }) as never);
  const mockWhere = vi.fn().mockReturnThis();
  const mockGet = vi.fn().mockResolvedValue({
    docs: [
      {
        data: () => ({
          recipientUid: uid,
          status: "accepted",
          expiry: "permanent",
        }),
      },
    ],
  });
  mockDb.collection = vi.fn().mockReturnValue({
    where: mockWhere,
    get: mockGet,
  });
}

function mockNoAccess() {
  mockGetRecord.mockResolvedValue(makeRecord({ ownerUid: "uid-other" }) as never);
  const mockWhere = vi.fn().mockReturnThis();
  const mockGet = vi.fn().mockResolvedValue({ docs: [] });
  mockDb.collection = vi.fn().mockReturnValue({
    where: mockWhere,
    get: mockGet,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteAuditLog.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Disclaimer always present
// ---------------------------------------------------------------------------

describe("summarizeRecord — disclaimer", () => {
  it("always includes the exact disclaimer string in the response", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("Summary text here.");

    const result = await (summarizeRecord as Function)(
      { recordId: "rec-1" },
      makeContext("uid-owner")
    );

    expect(result.disclaimer).toBe(DISCLAIMER);
  });

  it("returns disclaimer even when summary is minimal", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("No significant findings.");

    const result = await (summarizeRecord as Function)(
      { recordId: "rec-1" },
      makeContext("uid-owner")
    );

    expect(result.disclaimer).toBe(DISCLAIMER);
    expect(result.summary).toBe("No significant findings.");
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe("summarizeRecord — response shape", () => {
  it("returns summary, modelId, generatedAt, and disclaimer", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("Routine visit, no concerns.");

    const result = await (summarizeRecord as Function)(
      { recordId: "rec-1" },
      makeContext("uid-owner")
    );

    expect(result.summary).toBe("Routine visit, no concerns.");
    expect(result.modelId).toBe("anthropic.claude-sonnet-4-5-mock");
    expect(typeof result.generatedAt).toBe("string");
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
    expect(result.disclaimer).toBe(DISCLAIMER);
  });

  it("summary is not persisted — invokeModel called but getRecord not called again", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("Summary.");

    await (summarizeRecord as Function)(
      { recordId: "rec-1" },
      makeContext("uid-owner")
    );

    expect(mockGetRecord).toHaveBeenCalledOnce();
    expect(mockInvokeModel).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

describe("summarizeRecord — access control", () => {
  it("allows the record owner to summarize", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("Summary.");

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).resolves.toBeDefined();
  });

  it("allows a user with an accepted permanent share grant", async () => {
    mockSharedAccess("uid-recipient");
    mockInvokeModel.mockResolvedValue("Summary.");

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-recipient"))
    ).resolves.toBeDefined();
  });

  it("throws permission-denied for a user with no grant", async () => {
    mockNoAccess();

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-stranger"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws unauthenticated when auth context is missing", async () => {
    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("summarizeRecord — error cases", () => {
  it("throws not-found when record does not exist", async () => {
    mockGetRecord.mockResolvedValue(null);

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-missing" }, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws invalid-argument when recordId is missing", async () => {
    await expect(
      (summarizeRecord as Function)({}, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when recordId is an empty string", async () => {
    await expect(
      (summarizeRecord as Function)({ recordId: "" }, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws unavailable when invokeModel throws", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockRejectedValue(new Error("Connection timeout"));

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("throws internal when invokeModel returns empty string", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("");

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("throws internal when invokeModel returns whitespace only", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("   ");

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("logs error class but not error message on invokeModel failure", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockRejectedValue(new Error("internal bedrock path details"));

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).rejects.toBeDefined();

    expect(mockLoggerError).toHaveBeenCalledOnce();
    const logPayload = mockLoggerError.mock.calls[0][1] as Record<string, unknown>;
    expect(logPayload.error).toBe("Error");
    expect(JSON.stringify(logPayload)).not.toContain("internal bedrock path details");
  });
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

describe("summarizeRecord — audit log", () => {
  it("writes an ai.summarize audit entry on success", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockResolvedValue("Summary.");

    await (summarizeRecord as Function)(
      { recordId: "rec-1" },
      makeContext("uid-owner")
    );

    expect(mockWriteAuditLog).toHaveBeenCalledOnce();
    const auditCall = mockWriteAuditLog.mock.calls[0][0];
    expect(auditCall.actionType).toBe("ai.summarize");
    expect(auditCall.actorUid).toBe("uid-owner");
    expect(auditCall.recordId).toBe("rec-1");
    expect(auditCall.aiFunction).toBe("summarizeRecord");
    expect(auditCall.metadata?.modelId).toBe("anthropic.claude-sonnet-4-5-mock");
  });

  it("does not write audit entry when invokeModel fails", async () => {
    mockOwnerAccess();
    mockInvokeModel.mockRejectedValue(new Error("Bedrock down"));

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-owner"))
    ).rejects.toBeDefined();

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("does not write audit entry when access check fails", async () => {
    mockNoAccess();

    await expect(
      (summarizeRecord as Function)({ recordId: "rec-1" }, makeContext("uid-stranger"))
    ).rejects.toBeDefined();

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});