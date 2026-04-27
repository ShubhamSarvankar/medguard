import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    },
    FieldValue: { delete: () => "__delete__" },
  },
}));

const mockBatch = {
  update: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../lib/firestoreAdmin", () => ({
  getShareGrant: vi.fn(),
  getShareCode: vi.fn(),
  getRecord: vi.fn(),
  updateShareGrant: vi.fn(),
  updateShareCode: vi.fn(),
  updateRecord: vi.fn(),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
  db: {
    batch: () => mockBatch,
    collection: (name: string) => ({
      doc: (id: string) => ({ _path: `${name}/${id}` }),
    }),
  },
}));

vi.mock("../lib/kmsClient", () => ({
  unwrapDataKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 0xab)),
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
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
import { acceptShare } from "./acceptShare";

const FUTURE_MS = Date.now() + 60 * 60 * 1000;
const PAST_MS = Date.now() - 60 * 1000;

const pendingCodeGrant = {
  shareId: "share-1",
  recordId: "rec-1",
  senderUid: "sender",
  recipientUid: "",
  method: "code",
  status: "pending",
  expiry: "1h",
  expiresAt: { toMillis: () => FUTURE_MS },
  createdAt: {},
};

const pendingTapGrant = {
  ...pendingCodeGrant,
  method: "tap",
  recipientUid: "recipient",
};

const activeCode = {
  code: "ABC123",
  shareId: "share-1",
  recordId: "rec-1",
  senderUid: "sender",
  expiresAt: { toMillis: () => FUTURE_MS },
  used: false,
};

const mockRecord = {
  recordId: "rec-1",
  ownerUid: "sender",
  wrappedDataKey: Buffer.alloc(40, 0xff).toString("base64"),
  isDeidentified: true,
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.update.mockClear();
  mockBatch.commit.mockClear();
  vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue(pendingCodeGrant as never);
  vi.mocked(firestoreAdmin.getShareCode).mockResolvedValue(activeCode as never);
  vi.mocked(firestoreAdmin.getRecord).mockResolvedValue(mockRecord as never);
});

describe("acceptShare", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects when neither shareId nor code provided", async () => {
    await expect(
      (acceptShare as Function)({}, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when share code not found", async () => {
    vi.mocked(firestoreAdmin.getShareCode).mockResolvedValue(null);
    await expect(
      (acceptShare as Function)({ code: "ZZZZZZ" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects already-used code", async () => {
    vi.mocked(firestoreAdmin.getShareCode).mockResolvedValue({
      ...activeCode,
      used: true,
    } as never);
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("rejects expired code", async () => {
    vi.mocked(firestoreAdmin.getShareCode).mockResolvedValue({
      ...activeCode,
      expiresAt: { toMillis: () => PAST_MS },
    } as never);
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "deadline-exceeded" });
  });

  it("rejects revoked grant", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue({
      ...pendingCodeGrant,
      status: "revoked",
    } as never);
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects already-accepted grant", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue({
      ...pendingCodeGrant,
      status: "accepted",
    } as never);
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects tap share from wrong recipient", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue(pendingTapGrant as never);
    await expect(
      (acceptShare as Function)(
        { shareId: "share-1", sessionKeyHex: "a".repeat(64) },
        makeContext("wrong-user")
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects tap share without sessionKeyHex", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue(pendingTapGrant as never);
    await expect(
      (acceptShare as Function)({ shareId: "share-1" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects record with no wrappedDataKey", async () => {
    vi.mocked(firestoreAdmin.getRecord).mockResolvedValue({
      ...mockRecord,
      wrappedDataKey: undefined,
    } as never);
    await expect(
      (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("returns encryptedPayload for valid code share", async () => {
    const result = await (acceptShare as Function)(
      { code: "ABC123" },
      makeContext("recipient")
    );
    expect(result.shareId).toBe("share-1");
    expect(result.recordId).toBe("rec-1");
    expect(result.senderUid).toBe("sender");
    expect(typeof result.encryptedPayload).toBe("string");
    // iv(12) + dataKey(32) + tag(16) = 60 bytes → 80 chars base64
    expect(Buffer.from(result.encryptedPayload as string, "base64").length).toBe(60);
  });

  it("commits batch and marks code used on success", async () => {
    await (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"));
    expect(mockBatch.commit).toHaveBeenCalledOnce();
  });

  it("transitions grant to accepted status via batch", async () => {
    await (acceptShare as Function)({ code: "ABC123" }, makeContext("recipient"));
    const updateCalls = mockBatch.update.mock.calls;
    const statusUpdate = updateCalls.find(
      (call) => (call[1] as Record<string, unknown>).status === "accepted"
    );
    expect(statusUpdate).toBeDefined();
  });
});