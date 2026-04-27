import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  db: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        })),
      })),
    })),
  },
  setDeletionRequest: vi.fn(),
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
    fromMillis: vi.fn((ms: number) => ({
      toDate: () => new Date(ms),
      toMillis: () => ms,
    })),
    now: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
  },
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { deleteUserData } from "../user/deleteUserData";

const UID = "user-1";
const VALID_DATA = { uid: UID, confirmPhrase: "DELETE MY DATA" };
const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.setDeletionRequest).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
  // Reset the query mock to return empty (no pending requests)
  const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const mockWhere2 = vi.fn(() => ({ get: mockGet }));
  const mockWhere1 = vi.fn(() => ({ where: mockWhere2 }));
  vi.mocked(firestoreAdmin.db.collection).mockReturnValue({ where: mockWhere1 } as never);
});

describe("deleteUserData", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (deleteUserData as Function)(VALID_DATA, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects when uid does not match auth.uid", async () => {
    await expect(
      (deleteUserData as Function)(VALID_DATA, makeContext("other-user"))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects wrong confirm phrase", async () => {
    await expect(
      (deleteUserData as Function)(
        { uid: UID, confirmPhrase: "delete my data" },
        makeContext(UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects empty confirm phrase", async () => {
    await expect(
      (deleteUserData as Function)(
        { uid: UID, confirmPhrase: "" },
        makeContext(UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when a pending deletion already exists", async () => {
    const mockGet = vi.fn().mockResolvedValue({ empty: false, docs: [{}] });
    const mockWhere2 = vi.fn(() => ({ get: mockGet }));
    const mockWhere1 = vi.fn(() => ({ where: mockWhere2 }));
    vi.mocked(firestoreAdmin.db.collection).mockReturnValue({ where: mockWhere1 } as never);

    await expect(
      (deleteUserData as Function)(VALID_DATA, makeContext(UID))
    ).rejects.toMatchObject({ code: "already-exists" });
  });

  it("creates deletion request scheduled 30 days out", async () => {
    const before = Date.now();
    const result = await (deleteUserData as Function)(VALID_DATA, makeContext(UID));
    const after = Date.now();
    expect(result.deletionRequestId).toBeDefined();
    expect(result.scheduledFor).toBeDefined();
    const scheduled = new Date(result.scheduledFor as string).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(scheduled).toBeGreaterThanOrEqual(before + thirtyDays - 1000);
    expect(scheduled).toBeLessThanOrEqual(after + thirtyDays + 1000);
  });

  it("writes deletion request to Firestore", async () => {
    await (deleteUserData as Function)(VALID_DATA, makeContext(UID));
    expect(firestoreAdmin.setDeletionRequest).toHaveBeenCalledOnce();
    const [, savedRequest] = vi.mocked(firestoreAdmin.setDeletionRequest).mock.calls[0];
    expect(savedRequest.uid).toBe(UID);
    expect(savedRequest.processed).toBe(false);
  });

  it("writes audit log with user.deleteRequest", async () => {
    await (deleteUserData as Function)(VALID_DATA, makeContext(UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUid: UID, actionType: "user.deleteRequest" })
    );
  });
});
