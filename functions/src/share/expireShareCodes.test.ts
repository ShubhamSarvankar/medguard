import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatch = {
  delete: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockCollection = {
  doc: vi.fn().mockReturnValue({}),
  where: vi.fn().mockReturnThis(),
  get: vi.fn(),
};

vi.mock("../lib/firestoreAdmin", () => ({
  db: {
    batch: () => mockBatch,
    collection: () => mockCollection,
  },
  serverTimestamp: vi.fn(() => ({
    toDate: () => new Date(),
    toMillis: () => Date.now(),
  })),
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    },
  },
}));

vi.mock("firebase-functions", () => ({
  pubsub: {
    schedule: () => ({ onRun: (fn: unknown) => fn }),
  },
  logger: { error: vi.fn() },
}));

import { expireShareCodes } from "./expireShareCodes";
import { writeAuditLog } from "../audit/writeAuditLog";

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.delete.mockClear();
  mockBatch.update.mockClear();
  mockBatch.commit.mockResolvedValue(undefined);
  mockCollection.doc.mockReturnValue({});
});

describe("expireShareCodes", () => {
  it("does nothing when no expired codes exist", async () => {
    mockCollection.get.mockResolvedValue({ empty: true, docs: [] });

    await expect((expireShareCodes as Function)()).resolves.not.toThrow();

    expect(mockBatch.commit).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("deletes the code document for each expired code", async () => {
    const fakeDoc = {
      id: "CODE01",
      data: () => ({ shareId: "share-1", recordId: "rec-1" }),
    };
    mockCollection.get.mockResolvedValue({ empty: false, docs: [fakeDoc] });

    await (expireShareCodes as Function)();

    expect(mockBatch.delete).toHaveBeenCalledOnce();
    expect(mockBatch.commit).toHaveBeenCalledOnce();
  });

  it("updates the corresponding share grant to expired", async () => {
    const fakeDoc = {
      id: "CODE01",
      data: () => ({ shareId: "share-1", recordId: "rec-1" }),
    };
    mockCollection.get.mockResolvedValue({ empty: false, docs: [fakeDoc] });

    await (expireShareCodes as Function)();

    const updateCall = mockBatch.update.mock.calls.find(
      (call) => (call[1] as Record<string, unknown>).status === "expired"
    );
    expect(updateCall).toBeDefined();
  });

  it("writes an audit entry for each expired code", async () => {
    const fakeDoc = {
      id: "CODE01",
      data: () => ({ shareId: "share-1", recordId: "rec-1" }),
    };
    mockCollection.get.mockResolvedValue({ empty: false, docs: [fakeDoc] });

    await (expireShareCodes as Function)();

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "share.expire",
        shareId: "share-1",
        recordId: "rec-1",
      })
    );
  });

  it("processes multiple expired codes independently", async () => {
    const fakeDocs = [
      { id: "CODE01", data: () => ({ shareId: "share-1", recordId: "rec-1" }) },
      { id: "CODE02", data: () => ({ shareId: "share-2", recordId: "rec-2" }) },
    ];
    mockCollection.get.mockResolvedValue({ empty: false, docs: fakeDocs });

    await (expireShareCodes as Function)();

    expect(mockBatch.commit).toHaveBeenCalledTimes(2);
    expect(writeAuditLog).toHaveBeenCalledTimes(2);
  });

  it("only targets unused codes via the query filters", () => {
    mockCollection.get.mockResolvedValue({ empty: true, docs: [] });
    const whereSpy = vi.spyOn(mockCollection, "where");

    void (expireShareCodes as Function)();

    const whereCalls = whereSpy.mock.calls;
    expect(whereCalls.some((c) => c[0] === "expiresAt")).toBe(true);
    expect(whereCalls.some((c) => c[0] === "used" && c[2] === false)).toBe(true);
  });
});