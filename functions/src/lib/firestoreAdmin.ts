import * as admin from "firebase-admin";
import type {
  MedicalRecord,
  User,
  CareCircleMember,
  CareCircleInvite,
  ShareGrant,
  ShareCode,
  AuditEntry,
  RecordAnnotation,
  DeletionRequest,
} from "@medguard/types";

if (!admin.apps.length) {
  const usingEmulator =
    process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
    process.env.USE_EMULATORS === "true";

  if (usingEmulator) {
    // When FIRESTORE_EMULATOR_HOST is set the Admin SDK routes all traffic
    // to the emulator and does not validate credentials against Google.
    // Passing only projectId (no credential) is the correct pattern for v12.
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? "medguard-dev",
    });
  } else {
    admin.initializeApp();
  }
}

export const db = admin.firestore();

export function serverTimestamp(): FirebaseFirestore.Timestamp {
  // Require Timestamp from the underlying Firestore package directly.
  // admin.firestore.Timestamp (namespace accessor) can be undefined in the
  // Functions emulator sandbox; the package-level Timestamp is always available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Timestamp } = require("@google-cloud/firestore") as {
    Timestamp: typeof FirebaseFirestore.Timestamp;
  };
  return Timestamp.now();
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function getRecord(recordId: string): Promise<MedicalRecord | null> {
  const snap = await db.collection("records").doc(recordId).get();
  return snap.exists ? (snap.data() as MedicalRecord) : null;
}

export async function setRecord(recordId: string, data: MedicalRecord): Promise<void> {
  await db.collection("records").doc(recordId).set(data);
}

export async function updateRecord(
  recordId: string,
  data: Partial<MedicalRecord>
): Promise<void> {
  await db.collection("records").doc(recordId).update(data);
}

export async function deleteRecord(recordId: string): Promise<void> {
  await db.collection("records").doc(recordId).delete();
}

export async function getPendingRecord(recordId: string): Promise<MedicalRecord | null> {
  const snap = await db.collection("pendingRecords").doc(recordId).get();
  return snap.exists ? (snap.data() as MedicalRecord) : null;
}

export async function setPendingRecord(recordId: string, data: MedicalRecord): Promise<void> {
  await db.collection("pendingRecords").doc(recordId).set(data);
}

export async function deletePendingRecord(recordId: string): Promise<void> {
  await db.collection("pendingRecords").doc(recordId).delete();
}

export async function getCareCircleMember(
  patientUid: string,
  memberUid: string
): Promise<CareCircleMember | null> {
  const snap = await db
    .collection("users")
    .doc(patientUid)
    .collection("careCircle")
    .doc(memberUid)
    .get();
  return snap.exists ? (snap.data() as CareCircleMember) : null;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUser(uid: string): Promise<User | null> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as User) : null;
}

export async function setUser(uid: string, data: User): Promise<void> {
  await db.collection("users").doc(uid).set(data);
}

export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await db.collection("users").doc(uid).update(data);
}

// ---------------------------------------------------------------------------
// Care circle invites
// ---------------------------------------------------------------------------

export async function getCareCircleInvite(inviteId: string): Promise<CareCircleInvite | null> {
  const snap = await db.collection("careCircleInvites").doc(inviteId).get();
  return snap.exists ? (snap.data() as CareCircleInvite) : null;
}

export async function setCareCircleInvite(inviteId: string, data: CareCircleInvite): Promise<void> {
  await db.collection("careCircleInvites").doc(inviteId).set(data);
}

export async function updateCareCircleInvite(
  inviteId: string,
  data: Partial<CareCircleInvite>
): Promise<void> {
  await db.collection("careCircleInvites").doc(inviteId).update(data);
}

// ---------------------------------------------------------------------------
// Care circle members
// ---------------------------------------------------------------------------

export async function setCareCircleMember(
  patientUid: string,
  memberUid: string,
  data: CareCircleMember
): Promise<void> {
  await db
    .collection("users")
    .doc(patientUid)
    .collection("careCircle")
    .doc(memberUid)
    .set(data);
}

export async function deleteCareCircleMember(
  patientUid: string,
  memberUid: string
): Promise<void> {
  await db
    .collection("users")
    .doc(patientUid)
    .collection("careCircle")
    .doc(memberUid)
    .delete();
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export async function getShareGrant(shareId: string): Promise<ShareGrant | null> {
  const snap = await db.collection("shares").doc(shareId).get();
  return snap.exists ? (snap.data() as ShareGrant) : null;
}

export async function setShareGrant(shareId: string, data: ShareGrant): Promise<void> {
  await db.collection("shares").doc(shareId).set(data);
}

export async function updateShareGrant(
  shareId: string,
  data: Partial<ShareGrant>
): Promise<void> {
  await db.collection("shares").doc(shareId).update(data);
}

export async function getShareCode(code: string): Promise<ShareCode | null> {
  const snap = await db.collection("shareCodes").doc(code).get();
  return snap.exists ? (snap.data() as ShareCode) : null;
}

export async function setShareCode(code: string, data: ShareCode): Promise<void> {
  await db.collection("shareCodes").doc(code).set(data);
}

export async function updateShareCode(
  code: string,
  data: Partial<ShareCode>
): Promise<void> {
  await db.collection("shareCodes").doc(code).update(data);
}

export async function deleteShareCode(code: string): Promise<void> {
  await db.collection("shareCodes").doc(code).delete();
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function writeAuditEntry(entry: AuditEntry): Promise<void> {
  await db.collection("auditLog").doc(entry.entryId).set(entry);
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export async function getAnnotation(
  recordId: string,
  annotationId: string
): Promise<RecordAnnotation | null> {
  const snap = await db
    .collection("records")
    .doc(recordId)
    .collection("annotations")
    .doc(annotationId)
    .get();
  return snap.exists ? (snap.data() as RecordAnnotation) : null;
}

export async function setAnnotation(
  recordId: string,
  annotationId: string,
  data: RecordAnnotation
): Promise<void> {
  await db
    .collection("records")
    .doc(recordId)
    .collection("annotations")
    .doc(annotationId)
    .set(data);
}

export async function updateAnnotation(
  recordId: string,
  annotationId: string,
  data: Partial<RecordAnnotation>
): Promise<void> {
  await db
    .collection("records")
    .doc(recordId)
    .collection("annotations")
    .doc(annotationId)
    .update(data);
}

export async function deleteAnnotation(
  recordId: string,
  annotationId: string
): Promise<void> {
  await db
    .collection("records")
    .doc(recordId)
    .collection("annotations")
    .doc(annotationId)
    .delete();
}

// ---------------------------------------------------------------------------
// Deletion requests
// ---------------------------------------------------------------------------

export async function getDeletionRequest(
  deletionRequestId: string
): Promise<DeletionRequest | null> {
  const snap = await db.collection("deletionRequests").doc(deletionRequestId).get();
  return snap.exists ? (snap.data() as DeletionRequest) : null;
}

export async function setDeletionRequest(
  deletionRequestId: string,
  data: DeletionRequest
): Promise<void> {
  await db.collection("deletionRequests").doc(deletionRequestId).set(data);
}

export async function updateDeletionRequest(
  deletionRequestId: string,
  data: Partial<DeletionRequest>
): Promise<void> {
  await db.collection("deletionRequests").doc(deletionRequestId).update(data);
}

export async function getPendingDeletionRequests(): Promise<DeletionRequest[]> {
  const now = admin.firestore.Timestamp.now();
  const snap = await db
    .collection("deletionRequests")
    .where("scheduledFor", "<=", now)
    .where("processed", "==", false)
    .get();
  return snap.docs.map((d) => d.data() as DeletionRequest);
}