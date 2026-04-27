import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatch = {
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../lib/firestoreAdmin", () => ({
  getCareCircleMember: vi.fn(),
  deleteCareCircleMember: vi.fn(),
  db: {
    collection: vi.fn(),
    batch: vi.fn(() => mockBatch),
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

vi.mock("@google-cloud/firestore", () => ({
  FieldValue: {
    delete: vi.fn(() => "__DELETE__"),
  },
}));

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { removeCareCircleMember } from "../user/removeCareCircleMember";

const PATIENT_UID = "patient-1";
const MEMBER_UID = "member-1";
const VALID_DATA = { memberUid: MEMBER_UID };
const makeContext = (uid: string) => ({ auth: { uid } });

function makeShareDoc(shareId: string, recipientUid: string) {
  return {
    ref: { id: shareId },
    data: () => ({
      senderUid: PATIENT_UID,
      recipientUid,
      status: "accepted",
      recordId: `record-${shareId}`,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBatch.commit.mockResolvedValue(undefined);
  vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue({ uid: MEMBER_UID } as never);
  vi.mocked(firestoreAdmin.deleteCareCircleMember).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);

  vi.mocked(firestoreAdmin.db.collection).mockImplementation(() => ({
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    doc: vi.fn((id: string) => ({ id })),
  } as never));
});

describe("removeCareCircleMember", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (removeCareCircleMember as Function)(VALID_DATA, { auth: null })
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects missing memberUid", async () => {
    await expect(
      (removeCareCircleMember as Function)({}, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when member is not in care circle", async () => {
    vi.mocked(firestoreAdmin.getCareCircleMember).mockResolvedValue(null);
    await expect(
      (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID))
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("deletes care circle member", async () => {
    const result = await (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID));
    expect(result).toEqual({ memberUid: MEMBER_UID });
    expect(firestoreAdmin.deleteCareCircleMember).toHaveBeenCalledWith(PATIENT_UID, MEMBER_UID);
  });

  it("does not commit batch when no shares exist", async () => {
    await (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID));
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("revokes accepted shares from patient to removed member", async () => {
    const shareDoc = makeShareDoc("share-1", MEMBER_UID);
    vi.mocked(firestoreAdmin.db.collection).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: [shareDoc] }),
      doc: vi.fn((id: string) => ({ id })),
    } as never));

    await (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID));

    expect(mockBatch.update).toHaveBeenCalledWith(
      shareDoc.ref,
      expect.objectContaining({ status: "revoked" })
    );
    expect(mockBatch.commit).toHaveBeenCalledOnce();
  });

  it("does not revoke shares belonging to other recipients", async () => {
    const otherShare = makeShareDoc("share-2", "other-recipient");
    vi.mocked(firestoreAdmin.db.collection).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: [otherShare] }),
      doc: vi.fn((id: string) => ({ id })),
    } as never));

    await (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID));

    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("writes audit log with careCircle.remove", async () => {
    await (removeCareCircleMember as Function)(VALID_DATA, makeContext(PATIENT_UID));
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: PATIENT_UID,
        actionType: "careCircle.remove",
        metadata: expect.objectContaining({ memberUid: MEMBER_UID }),
      })
    );
  });
});
