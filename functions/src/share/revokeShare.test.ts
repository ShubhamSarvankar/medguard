import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatch = {
  update: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../lib/firestoreAdmin", () => ({
  getShareGrant: vi.fn(),
  updateShareGrant: vi.fn(),
  serverTimestamp: vi.fn(() => ({
    toDate: () => new Date("2025-01-01"),
    toMillis: () => 1735689600000,
  })),
  db: {
    batch: () => mockBatch,
    collection: (name: string) => ({
      doc: (id: string) => ({ _path: `${name}/${id}` }),
    }),
  },
}));

vi.mock("../audit/writeAuditLog", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: { delete: () => "__delete__" },
  },
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
import { revokeShare } from "./revokeShare";

const acceptedGrant = {
  shareId: "share-1",
  recordId: "rec-1",
  senderUid: "owner",
  recipientUid: "recipient",
  method: "code",
  status: "accepted",
  expiry: "7d",
  createdAt: {},
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.update.mockClear();
  mockBatch.commit.mockResolvedValue(undefined);
  vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue(acceptedGrant as never);
});

describe("revokeShare", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (revokeShare as Function)({ shareId: "share-1" }, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects when share not found", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue(null);
    await expect(
      (revokeShare as Function)({ shareId: "share-1" }, makeContext("owner"))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when caller is not the owner", async () => {
    await expect(
      (revokeShare as Function)({ shareId: "share-1" }, makeContext("non-owner"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects already-revoked share", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue({
      ...acceptedGrant,
      status: "revoked",
    } as never);
    await expect(
      (revokeShare as Function)({ shareId: "share-1" }, makeContext("owner"))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects already-expired share", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue({
      ...acceptedGrant,
      status: "expired",
    } as never);
    await expect(
      (revokeShare as Function)({ shareId: "share-1" }, makeContext("owner"))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("sets status to revoked and returns revokedAt", async () => {
    const result = await (revokeShare as Function)(
      { shareId: "share-1" },
      makeContext("owner")
    );
    expect(result.shareId).toBe("share-1");
    expect(result.revokedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(mockBatch.commit).toHaveBeenCalledOnce();
  });

  it("includes grants map deletion in batch when recipientUid is set", async () => {
    await (revokeShare as Function)({ shareId: "share-1" }, makeContext("owner"));
    const updateCalls = mockBatch.update.mock.calls;
    const grantsUpdate = updateCalls.find((call) => {
      const data = call[1] as Record<string, unknown>;
      return Object.keys(data).some((k) => k.startsWith("grants."));
    });
    expect(grantsUpdate).toBeDefined();
  });

  it("skips grants map deletion when recipientUid is empty", async () => {
    vi.mocked(firestoreAdmin.getShareGrant).mockResolvedValue({
      ...acceptedGrant,
      recipientUid: "",
    } as never);
    await (revokeShare as Function)({ shareId: "share-1" }, makeContext("owner"));
    const updateCalls = mockBatch.update.mock.calls;
    const grantsUpdate = updateCalls.find((call) => {
      const data = call[1] as Record<string, unknown>;
      return Object.keys(data).some((k) => k.startsWith("grants."));
    });
    expect(grantsUpdate).toBeUndefined();
  });
});