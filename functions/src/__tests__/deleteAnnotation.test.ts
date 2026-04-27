import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firestoreAdmin", () => ({
  getAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
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

import * as firestoreAdmin from "../lib/firestoreAdmin";
import * as auditModule from "../audit/writeAuditLog";
import { deleteAnnotation } from "../records/deleteAnnotation";

const AUTHOR_UID = "clinician-1";
const RECORD_ID = "rec-1";
const ANNOTATION_ID = "ann-1";

const mockAnnotation = {
  annotationId: ANNOTATION_ID,
  recordId: RECORD_ID,
  authorUid: AUTHOR_UID,
  text: "Some note",
};

const makeContext = (uid: string) => ({ auth: { uid } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreAdmin.getAnnotation).mockResolvedValue(mockAnnotation as never);
  vi.mocked(firestoreAdmin.deleteAnnotation).mockResolvedValue(undefined);
  vi.mocked(auditModule.writeAuditLog).mockResolvedValue(undefined);
});

describe("deleteAnnotation", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      (deleteAnnotation as Function)(
        { recordId: RECORD_ID, annotationId: ANNOTATION_ID },
        { auth: null }
      )
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects invalid schema (missing annotationId)", async () => {
    await expect(
      (deleteAnnotation as Function)(
        { recordId: RECORD_ID },
        makeContext(AUTHOR_UID)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects when annotation not found", async () => {
    vi.mocked(firestoreAdmin.getAnnotation).mockResolvedValue(null);
    await expect(
      (deleteAnnotation as Function)(
        { recordId: RECORD_ID, annotationId: ANNOTATION_ID },
        makeContext(AUTHOR_UID)
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects when caller is not the author", async () => {
    await expect(
      (deleteAnnotation as Function)(
        { recordId: RECORD_ID, annotationId: ANNOTATION_ID },
        makeContext("other-user")
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("deletes annotation and returns annotationId", async () => {
    const result = await (deleteAnnotation as Function)(
      { recordId: RECORD_ID, annotationId: ANNOTATION_ID },
      makeContext(AUTHOR_UID)
    );
    expect(result.annotationId).toBe(ANNOTATION_ID);
    expect(firestoreAdmin.deleteAnnotation).toHaveBeenCalledWith(RECORD_ID, ANNOTATION_ID);
  });

  it("writes audit log with annotation.delete", async () => {
    await (deleteAnnotation as Function)(
      { recordId: RECORD_ID, annotationId: ANNOTATION_ID },
      makeContext(AUTHOR_UID)
    );
    expect(auditModule.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUid: AUTHOR_UID,
        actionType: "annotation.delete",
        recordId: RECORD_ID,
      })
    );
  });
});
