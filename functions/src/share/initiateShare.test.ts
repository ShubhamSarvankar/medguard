import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getRecord: vi.fn(),
  getUser: vi.fn(),
  setShareGrant: vi.fn(),
  setShareCode: vi.fn(),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
  db: {},
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
import { initiateShare } from "./initiateShare";

const mockRecord = {
  recordId: "rec-1",
  ownerUid: "user-sender",
  isDeidentified: true,
};

const mockUser = { uid: "user-recipient", displayName: "Test User" };

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getRecord).mockResolvedValue(mockRecord as never);
  vi.mocked(firestoreAdmin.getUser).mockResolvedValue(mockUser as never);
  vi.mocked(firestoreAdmin.setShareGrant).mockResolvedValue(undefined);
  vi.mocked(firestoreAdmin.setShareCode).mockResolvedValue(undefined);
});

describe("initiateShare", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (initiateShare as Function)(
        { recordId: "rec-1", method: "code", expiry: "1h" },
        { auth: null }
      )
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects when record not found", async () => {
    vi.mocked(firestoreAdmin.getRecord).mockResolvedValue(null);
    await expect(
      (initiateShare as Function)(
        { recordId: "rec-1", method: "code", expiry: "1h" },
        makeContext("user-sender")
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when caller is not the owner", async () => {
    await expect(
      (initiateShare as Function)(
        { recordId: "rec-1", method: "code", expiry: "1h" },
        makeContext("user-other")
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects tap share without recipientUid", async () => {
    await expect(
      (initiateShare as Function)(
        { recordId: "rec-1", method: "tap", expiry: "permanent" },
        makeContext("user-sender")
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects tap share when recipientUid not a registered user", async () => {
    vi.mocked(firestoreAdmin.getUser).mockResolvedValue(null);
    await expect(
      (initiateShare as Function)(
        { recordId: "rec-1", method: "tap", recipientUid: "ghost", expiry: "permanent" },
        makeContext("user-sender")
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("creates grant and returns shareId for code share", async () => {
    const result = await (initiateShare as Function)(
      { recordId: "rec-1", method: "code", expiry: "1h" },
      makeContext("user-sender")
    );
    expect(result.shareId).toBeDefined();
    expect(result.code).toMatch(/^[0-9A-Z]{6}$/);
    expect(result.expiresAt).toBeDefined();
    expect(firestoreAdmin.setShareGrant).toHaveBeenCalledOnce();
    expect(firestoreAdmin.setShareCode).toHaveBeenCalledOnce();
  });

  it("omits expiresAt for permanent expiry", async () => {
    const result = await (initiateShare as Function)(
      { recordId: "rec-1", method: "code", expiry: "permanent" },
      makeContext("user-sender")
    );
    expect(result.expiresAt).toBeUndefined();
  });

  it("does not create a share code for tap share", async () => {
    await (initiateShare as Function)(
      { recordId: "rec-1", method: "tap", recipientUid: "user-recipient", expiry: "7d" },
      makeContext("user-sender")
    );
    expect(firestoreAdmin.setShareCode).not.toHaveBeenCalled();
    expect(firestoreAdmin.setShareGrant).toHaveBeenCalledOnce();
  });

  it("sets correct expiresAt for 24h expiry", async () => {
    const before = Date.now();
    const result = await (initiateShare as Function)(
      { recordId: "rec-1", method: "code", expiry: "24h" },
      makeContext("user-sender")
    );
    const after = Date.now();
    const expiresMs = new Date(result.expiresAt as string).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 100);
    expect(expiresMs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 100);
  });

  it("generates unique codes across 1000 samples", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const result = await (initiateShare as Function)(
        { recordId: "rec-1", method: "code", expiry: "1h" },
        makeContext("user-sender")
      );
      codes.add(result.code as string);
    }
    expect(codes.size).toBeGreaterThan(990);
  });
});