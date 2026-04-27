import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { MedicalRecord, AuditEntry, RecordAnnotation, User, CareCircleMember, CareCircleInvite } from "@medguard/types";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function fetchRecords(ownerUid: string): Promise<MedicalRecord[]> {
  const q = query(
    collection(db, "records"),
    where("ownerUid", "==", ownerUid)
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => d.data() as MedicalRecord);
  return records.sort((a, b) => {
    const aSeconds = (a.visitDate as unknown as { seconds: number })?.seconds ?? 0;
    const bSeconds = (b.visitDate as unknown as { seconds: number })?.seconds ?? 0;
    return bSeconds - aSeconds;
  });
}

export async function fetchRecord(recordId: string): Promise<MedicalRecord | null> {
  const snap = await getDoc(doc(db, "records", recordId));
  return snap.exists() ? (snap.data() as MedicalRecord) : null;
}

export async function createRecord(
  recordId: string,
  data: Omit<MedicalRecord, "createdAt" | "updatedAt">
): Promise<void> {
  await setDoc(doc(db, "records", recordId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRecord(
  recordId: string,
  data: Partial<MedicalRecord>
): Promise<void> {
  await updateDoc(doc(db, "records", recordId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRecord(recordId: string): Promise<void> {
  await deleteDoc(doc(db, "records", recordId));
}

export function subscribeToRecords(
  ownerUid: string,
  onData: (records: MedicalRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "records"),
    where("ownerUid", "==", ownerUid),
    orderBy("visitDate", "desc")
  );
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => d.data() as MedicalRecord));
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function fetchAuditLog(uid: string): Promise<AuditEntry[]> {
  const q = query(
    collection(db, "auditLog"),
    where("actorUid", "==", uid),
    orderBy("timestamp", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AuditEntry);
}

export async function fetchAuditLogByRecord(recordId: string): Promise<AuditEntry[]> {
  const q = query(
    collection(db, "auditLog"),
    where("recordId", "==", recordId),
    orderBy("timestamp", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AuditEntry);
}

// ---------------------------------------------------------------------------
// Pending records
// ---------------------------------------------------------------------------

export async function fetchPendingRecords(uid: string): Promise<MedicalRecord[]> {
  const q = query(
    collection(db, "pendingRecords"),
    where("ownerUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as MedicalRecord);
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export async function fetchAnnotations(recordId: string): Promise<RecordAnnotation[]> {
  const q = query(
    collection(db, "records", recordId, "annotations"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as RecordAnnotation);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as User) : null;
}

// ---------------------------------------------------------------------------
// Care circle
// ---------------------------------------------------------------------------

export async function fetchCareCircle(patientUid: string): Promise<CareCircleMember[]> {
  const q = query(collection(db, "users", patientUid, "careCircle"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CareCircleMember);
}

export async function fetchPendingInvites(inviteeUid: string): Promise<CareCircleInvite[]> {
  const q = query(
    collection(db, "careCircleInvites"),
    where("inviteeUid", "==", inviteeUid),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CareCircleInvite);
}