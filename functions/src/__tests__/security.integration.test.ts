/**
 * Phase 8.5 — Security-specific integration tests
 *
 * Each test is labelled with the threat it addresses from the threat model:
 *   T03 — Firestore exfiltration (field-level encryption)
 *   T06 — Share code brute force (rate limiting on acceptShare)
 *   T07 — Audit log tampering (append-only Firestore rules)
 *   T09 — Care circle privilege escalation (Firestore rules enforce per-record access)
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as admin from "firebase-admin";
import type { MedicalRecord, AuditEntry } from "@medguard/types";
import { wrapDataKey } from "../lib/kmsClient";

const FUNCTIONS_BASE =
  process.env.FUNCTIONS_EMULATOR_URL ?? "http://127.0.0.1:5001/medguard-dev/us-central1";

const FIRESTORE_REST_BASE =
  "http://127.0.0.1:8080/v1/projects/medguard-dev/databases/(default)/documents";

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

const OWNER_UID = "sec-test-owner";
const ATTACKER_UID = "sec-test-attacker";

beforeAll(async () => {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "medguard-dev" });
  }
  db = admin.firestore();
  auth = admin.auth();

  for (const [uid, email] of [
    [OWNER_UID, "sec-owner@test.com"],
    [ATTACKER_UID, "sec-attacker@test.com"],
  ]) {
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({ uid, email, password: "TestPass123!" });
    }
  }
});

afterEach(async () => {
  const batch = db.batch();
  for (const col of ["records", "shares", "shareCodes", "auditLog", "rateLimits"]) {
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
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

async function callFunction(
  name: string,
  data: unknown,
  idToken: string
): Promise<unknown> {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string; status: string };
  };
  if (json.error) {
    const err = new Error(json.error.message) as Error & { code: string };
    err.code = json.error.status?.toLowerCase().replace(/_/g, "-") ?? "unknown";
    throw err;
  }
  return json.result;
}

async function seedEncryptedRecord(recordId: string, ownerUid: string): Promise<void> {
  const dataKey = Buffer.alloc(32, 0xcd);
  const wrappedDataKey = (await wrapDataKey(ownerUid, dataKey)).toString("base64");
  const record: Partial<MedicalRecord> = {
    recordId,
    ownerUid,
    createdByUid: ownerUid,
    status: "active",
    isDeidentified: true,
    wrappedDataKey,
    encryptedFields: "c2VjdXJlY2lwaGVydGV4dA==",
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    visitDate: admin.firestore.Timestamp.now(),
  };
  await db.collection("records").doc(recordId).set(record);
}

async function waitForDeidentification(
  recordId: string,
  timeoutMs = 5000
): Promise<admin.firestore.DocumentSnapshot> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db.collection("records").doc(recordId).get();
    if (snap.exists && (snap.data() as MedicalRecord).isDeidentified) return snap;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Record ${recordId} not de-identified within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// T03 — Firestore exfiltration: field-level encryption
// ---------------------------------------------------------------------------

describe("T03 — field-level encryption", () => {
  it("written Firestore document has no PHI at top level and encryptedFields is opaque base64", async () => {
    const recordId = "sec-t03-phi-check";
    const PHI_STRINGS = [
      "Test Patient Alpha",
      "234-56-7890",
      "01/15/1980",
      "test.phi@example.com",
    ];

    const raw: Partial<MedicalRecord> = {
      recordId,
      ownerUid: OWNER_UID,
      createdByUid: OWNER_UID,
      status: "active",
      title: "Visit for Test Patient Alpha",
      notes:
        "SSN: 234-56-7890. DOB: 01/15/1980. Email: test.phi@example.com.",
      medications: [],
      diagnoses: [],
      attachments: [],
      isDeidentified: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      visitDate: admin.firestore.Timestamp.now(),
    };

    await db.collection("records").doc(recordId).set(raw);
    const snap = await waitForDeidentification(recordId);
    const doc = snap.data() as Record<string, unknown>;

    // encryptedFields must be present and opaque base64
    expect(typeof doc.encryptedFields).toBe("string");
    expect(doc.encryptedFields as string).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect((doc.encryptedFields as string).length).toBeGreaterThan(20);

    // wrappedDataKey must be present
    expect(typeof doc.wrappedDataKey).toBe("string");

    // Plaintext sensitive fields must not exist at top level
    expect(doc.title).toBeUndefined();
    expect(doc.notes).toBeUndefined();
    expect(doc.medications).toBeUndefined();
    expect(doc.diagnoses).toBeUndefined();

    // Verify no PHI strings appear anywhere in the serialised document
    const docJson = JSON.stringify(doc);
    for (const phi of PHI_STRINGS) {
      expect(docJson).not.toContain(phi);
    }
  });
});

// ---------------------------------------------------------------------------
// T06 — Share code brute force: rate limiting on acceptShare
// ---------------------------------------------------------------------------

describe("T06 — rate limiting on acceptShare", () => {
  it("11th acceptShare attempt within rate-limit window returns resource-exhausted", async () => {
    const attackerToken = await mintIdToken(ATTACKER_UID);

    // Pre-seed the rate-limit counter to exactly the limit (10/min) so the
    // next call — regardless of whether the share code is valid — is rejected.
    const windowKey = String(Math.floor(Date.now() / 60000));
    await db
      .collection("rateLimits")
      .doc(ATTACKER_UID)
      .collection("acceptShare")
      .doc(windowKey)
      .set({
        count: 10,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 120000),
        windowKey,
        uid: ATTACKER_UID,
      });

    // This call hits the rate limit before any grant resolution
    await expect(
      callFunction("acceptShare", { code: "XXXXXX" }, attackerToken)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});

// ---------------------------------------------------------------------------
// T07 — Audit log tampering: Firestore rules block client writes
// ---------------------------------------------------------------------------

describe("T07 — audit log immutability", () => {
  it("authenticated client cannot delete an audit log entry (permission-denied)", async () => {
    // Seed an audit entry via Admin SDK (bypasses rules)
    const entryId = "sec-t07-audit-entry";
    const entry: AuditEntry = {
      entryId,
      actorUid: OWNER_UID,
      actionType: "record.read",
      recordId: "some-record",
      timestamp: admin.firestore.Timestamp.now(),
    };
    await db.collection("auditLog").doc(entryId).set(entry);

    // Authenticated user attempts DELETE via Firestore REST API
    const ownerToken = await mintIdToken(OWNER_UID);
    const res = await fetch(`${FIRESTORE_REST_BASE}/auditLog/${entryId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    // Firestore rules: allow write: if false — must be 403
    expect(res.status).toBe(403);

    // Confirm the entry still exists
    const snap = await db.collection("auditLog").doc(entryId).get();
    expect(snap.exists).toBe(true);
  });

  it("authenticated client cannot update an audit log entry (permission-denied)", async () => {
    const entryId = "sec-t07-audit-update";
    const entry: AuditEntry = {
      entryId,
      actorUid: OWNER_UID,
      actionType: "record.read",
      timestamp: admin.firestore.Timestamp.now(),
    };
    await db.collection("auditLog").doc(entryId).set(entry);

    const ownerToken = await mintIdToken(OWNER_UID);
    const res = await fetch(
      `${FIRESTORE_REST_BASE}/auditLog/${entryId}?updateMask.fieldPaths=actorUid`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          fields: { actorUid: { stringValue: "tampered" } },
        }),
      }
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// T09 — Care circle privilege escalation: Firestore rules enforce per-record access
// ---------------------------------------------------------------------------

describe("T09 — Firestore rules enforce per-record access control", () => {
  it("authenticated user without a share grant cannot read another user's record", async () => {
    const recordId = "sec-t09-unshared-record";
    await seedEncryptedRecord(recordId, OWNER_UID);

    // ATTACKER_UID has no share grant for this record
    const attackerToken = await mintIdToken(ATTACKER_UID);
    const res = await fetch(`${FIRESTORE_REST_BASE}/records/${recordId}`, {
      headers: { Authorization: `Bearer ${attackerToken}` },
    });

    // Rule: allow read if ownerUid == request.auth.uid OR grant exists
    expect(res.status).toBe(403);
  });

  it("record owner can read their own record", async () => {
    const recordId = "sec-t09-owner-record";
    await seedEncryptedRecord(recordId, OWNER_UID);

    const ownerToken = await mintIdToken(OWNER_UID);
    const res = await fetch(`${FIRESTORE_REST_BASE}/records/${recordId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.status).toBe(200);
  });
});
