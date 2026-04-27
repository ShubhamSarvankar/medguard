import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import type { AuditEntry, MedicalRecord } from "@medguard/types";

const FIRESTORE_BASE =
  "http://127.0.0.1:8080/v1/projects/medguard-dev/databases/(default)/documents";

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

const PATIENT_UID = "audit-int-patient";
const CARETAKER_UID = "audit-int-caretaker";

beforeAll(async () => {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "medguard-dev" });
  }
  db = admin.firestore();
  auth = admin.auth();

  for (const [uid, email] of [
    [PATIENT_UID, "audit-patient@test.com"],
    [CARETAKER_UID, "audit-caretaker@test.com"],
  ]) {
    try {
      await auth.getUser(uid as string);
    } catch {
      await auth.createUser({ uid: uid as string, email: email as string, password: "TestPass123!" });
    }
  }
});

afterEach(async () => {
  const batch = db.batch();
  for (const col of ["records", "auditLog"]) {
    const snap = await db.collection(col).get();
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mintIdToken(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

async function firestoreGet(path: string, idToken: string): Promise<number> {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return res.status;
}

async function firestorePatch(
  path: string,
  idToken: string,
  fields: Record<string, unknown>
): Promise<number> {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  return res.status;
}

function makeRecord(recordId: string, ownerUid: string): Partial<MedicalRecord> {
  return {
    recordId,
    ownerUid,
    createdByUid: ownerUid,
    status: "active",
    title: "Audit Test Record",
    notes: "",
    medications: [],
    diagnoses: [],
    attachments: [],
    isDeidentified: true,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    visitDate: admin.firestore.Timestamp.now(),
  };
}

function makeEntry(
  entryId: string,
  actorUid: string,
  opts: { recordId?: string } = {}
): Partial<AuditEntry> {
  return {
    entryId,
    actorUid,
    actionType: "record.read",
    timestamp: admin.firestore.Timestamp.now(),
    ...(opts.recordId !== undefined && { recordId: opts.recordId }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auditLog security rules", () => {
  it("actor can read their own audit entry (no recordId)", async () => {
    const entryId = uuidv4();
    await db.collection("auditLog").doc(entryId).set(makeEntry(entryId, CARETAKER_UID));

    const token = await mintIdToken(CARETAKER_UID);
    const status = await firestoreGet(`auditLog/${entryId}`, token);
    expect(status).toBe(200);
  });

  it("patient (record owner) can read any audit entry for their record", async () => {
    const recordId = `audit-int-rec-${uuidv4()}`;
    await db.collection("records").doc(recordId).set(makeRecord(recordId, PATIENT_UID));

    const entryId = uuidv4();
    await db
      .collection("auditLog")
      .doc(entryId)
      .set(makeEntry(entryId, CARETAKER_UID, { recordId }));

    const patientToken = await mintIdToken(PATIENT_UID);
    const status = await firestoreGet(`auditLog/${entryId}`, patientToken);
    expect(status).toBe(200);
  });

  it("caretaker can read their own entry even when it references a patient record", async () => {
    const recordId = `audit-int-rec-${uuidv4()}`;
    await db.collection("records").doc(recordId).set(makeRecord(recordId, PATIENT_UID));

    const entryId = uuidv4();
    await db
      .collection("auditLog")
      .doc(entryId)
      .set(makeEntry(entryId, CARETAKER_UID, { recordId }));

    const caretakerToken = await mintIdToken(CARETAKER_UID);
    const status = await firestoreGet(`auditLog/${entryId}`, caretakerToken);
    expect(status).toBe(200);
  });

  it("caretaker cannot read audit entries they did not author for records they do not own", async () => {
    const recordId = `audit-int-rec-${uuidv4()}`;
    await db.collection("records").doc(recordId).set(makeRecord(recordId, PATIENT_UID));

    // Patient is the actor — caretaker is neither actor nor record owner
    const entryId = uuidv4();
    await db
      .collection("auditLog")
      .doc(entryId)
      .set(makeEntry(entryId, PATIENT_UID, { recordId }));

    const caretakerToken = await mintIdToken(CARETAKER_UID);
    const status = await firestoreGet(`auditLog/${entryId}`, caretakerToken);
    expect(status).toBe(403);
  });

  it("client write to auditLog is always denied", async () => {
    const entryId = uuidv4();
    const token = await mintIdToken(CARETAKER_UID);
    const status = await firestorePatch(`auditLog/${entryId}`, token, {
      actorUid: { stringValue: CARETAKER_UID },
    });
    expect(status).toBe(403);
  });

  it("unauthenticated read is denied", async () => {
    const entryId = uuidv4();
    await db.collection("auditLog").doc(entryId).set(makeEntry(entryId, CARETAKER_UID));

    // The Firestore emulator returns 403 for any rule denial, including
    // unauthenticated requests (request.auth == null fails isAuthenticated()).
    const res = await fetch(`${FIRESTORE_BASE}/auditLog/${entryId}`);
    expect(res.status).toBe(403);
  });
});
