import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

vi.mock("@/lib/firebase", () => ({
  firebaseApp: {},
  db: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
    signOut: vi.fn(),
  },
  fns: {},
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock("@/lib/firestore", () => ({
  fetchRecords: vi.fn(),
  fetchRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  subscribeToRecords: vi.fn(),
  fetchAuditLog: vi.fn(),
  fetchAuditLogByRecord: vi.fn(),
  fetchPendingRecords: vi.fn(),
  fetchAnnotations: vi.fn(),
  fetchUserProfile: vi.fn(),
  fetchCareCircle: vi.fn(),
  fetchPendingInvites: vi.fn(),
}));

vi.mock("@/lib/functions", () => ({
  callSummarizeRecord: vi.fn(),
  callInitiateShare: vi.fn(),
  callAcceptShare: vi.fn(),
  callRevokeShare: vi.fn(),
  callSubmitRecordForApproval: vi.fn(),
  callApproveRecord: vi.fn(),
  callRejectRecord: vi.fn(),
  callCreateAnnotation: vi.fn(),
  callUpdateAnnotation: vi.fn(),
  callDeleteAnnotation: vi.fn(),
  callInviteToCareCircle: vi.fn(),
  callAcceptCareCircleInvite: vi.fn(),
  callRemoveCareCircleMember: vi.fn(),
  callDeleteUserData: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({}));