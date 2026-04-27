import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuthInstance, mockBucketInstance } = vi.hoisted(() => {
  const mockBucketInstance = {
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  };
  const mockAuthInstance = {
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };
  return { mockAuthInstance, mockBucketInstance };
});

const mockBatch = {
  delete: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../lib/firestoreAdmin", () => ({
  db: {
    collection: vi.fn(),
    batch: vi.fn(() => mockBatch),
  },
  getPendingDeletionRequests: vi.fn(),
  updateDeletionRequest: vi.fn(),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
}));

vi.mock("firebase-admin", () => ({
  storage: vi.fn(() => ({ bucket: vi.fn(() => mockBucketInstance) })),
  auth: vi.fn(() => mockAuthInstance),
}));

vi.mock("firebase-functions", () => ({
  pubsub: {
    schedule: vi.fn(() => ({ onRun: vi.fn((fn: unknown) => fn) })),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import { runAccountDeletions } from "../user/processAccountDeletions";

const UID = "user-del-1";
const REQ_ID = "req-1";

function makeEmptySnap() {
  return { empty: true, docs: [] };
}

function makeDocWithSubcollections(ref: string) {
  return {
    ref: { id: ref },
    data: () => ({}),
    collection: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(makeEmptySnap()),
    })),
  };
}

function setupAllCollections() {
  vi.mocked(firestoreAdmin.db.collection).mockImplementation((name: string) => {
    if (name === "users") {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            get: vi.fn().mockResolvedValue(makeEmptySnap()),
          })),
        })),
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(makeEmptySnap()),
      } as never;
    }
    return {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(makeEmptySnap()),
      doc: vi.fn((id: string) => ({ id })),
    } as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.commit.mockResolvedValue(undefined);
  mockAuthInstance.deleteUser.mockResolvedValue(undefined);
  mockBucketInstance.deleteFiles.mockResolvedValue(undefined);
  vi.mocked(firestoreAdmin.updateDeletionRequest).mockResolvedValue(undefined);
});

describe("runAccountDeletions", () => {
  it("exits early when no pending requests", async () => {
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([]);
    await runAccountDeletions();
    expect(firestoreAdmin.db.collection).not.toHaveBeenCalled();
  });

  it("marks deletion request processed on success", async () => {
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([
      { uid: UID, deletionRequestId: REQ_ID } as never,
    ]);
    setupAllCollections();

    await runAccountDeletions();

    expect(firestoreAdmin.updateDeletionRequest).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ processed: true })
    );
  });

  it("deletes Firebase Auth account", async () => {
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([
      { uid: UID, deletionRequestId: REQ_ID } as never,
    ]);
    setupAllCollections();

    await runAccountDeletions();

    expect(mockAuthInstance.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("anonymizes audit log entries with anon- prefix", async () => {
    const auditDocRef = { id: "auditRef1" };
    const auditDoc = {
      ref: auditDocRef,
      data: () => ({ actorUid: UID }),
    };
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([
      { uid: UID, deletionRequestId: REQ_ID } as never,
    ]);
    vi.mocked(firestoreAdmin.db.collection).mockImplementation((name: string) => {
      if (name === "auditLog") {
        return {
          where: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ empty: false, docs: [auditDoc] }),
        } as never;
      }
      if (name === "users") {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn(() => ({
              get: vi.fn().mockResolvedValue(makeEmptySnap()),
            })),
          })),
          where: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue(makeEmptySnap()),
        } as never;
      }
      return {
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(makeEmptySnap()),
        doc: vi.fn((id: string) => ({ id })),
      } as never;
    });

    await runAccountDeletions();

    expect(mockBatch.update).toHaveBeenCalledWith(
      auditDocRef,
      expect.objectContaining({ actorUid: expect.stringMatching(/^anon-[0-9a-f]{16}$/) })
    );
  });

  it("gracefully handles Storage deletion failure", async () => {
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([
      { uid: UID, deletionRequestId: REQ_ID } as never,
    ]);
    setupAllCollections();
    mockBucketInstance.deleteFiles.mockRejectedValue(new Error("Storage not available"));

    await expect(runAccountDeletions()).resolves.toBeUndefined();
    expect(firestoreAdmin.updateDeletionRequest).toHaveBeenCalledWith(
      REQ_ID,
      expect.objectContaining({ processed: true })
    );
  });

  it("does not mark request processed when a critical step throws", async () => {
    vi.mocked(firestoreAdmin.getPendingDeletionRequests).mockResolvedValue([
      { uid: UID, deletionRequestId: REQ_ID } as never,
    ]);
    vi.mocked(firestoreAdmin.db.collection).mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    await expect(runAccountDeletions()).resolves.toBeUndefined();
    expect(firestoreAdmin.updateDeletionRequest).not.toHaveBeenCalled();
  });
});
