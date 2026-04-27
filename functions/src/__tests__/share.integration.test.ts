import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as admin from "firebase-admin";
import type { MedicalRecord, ShareGrant, ShareCode, AuditEntry } from "@medguard/types";
import { wrapDataKey } from "../lib/kmsClient";

// Cloud Functions callable endpoint base — matches vitest.integration.config.ts
const FUNCTIONS_BASE =
  process.env.FUNCTIONS_EMULATOR_URL ?? "http://127.0.0.1:5001/medguard-dev/us-central1";

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

// UIDs created once for the test suite
const SENDER_UID = "share-test-sender";
const RECIPIENT_UID = "share-test-recipient";

beforeAll(async () => {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "medguard-dev" });
  }
  db = admin.firestore();
  auth = admin.auth();

  // Ensure both test users exist in the emulator Auth
  for (const [uid, email] of [
    [SENDER_UID, "share-sender@test.com"],
    [RECIPIENT_UID, "share-recipient@test.com"],
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
  for (const col of ["records", "shares", "shareCodes", "auditLog"]) {
    const snap = await db.collection(col).get();
    snap.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedRecord(recordId: string, ownerUid: string): Promise<void> {
  const dataKey = Buffer.alloc(32, 0xcd);
  const wrappedDataKey = (await wrapDataKey(ownerUid, dataKey)).toString("base64");
  const record: Partial<MedicalRecord> = {
    recordId,
    ownerUid,
    createdByUid: ownerUid,
    status: "active",
    title: "Share Test Record",
    notes: "No PHI here.",
    medications: [],
    diagnoses: [],
    attachments: [],
    isDeidentified: true,
    wrappedDataKey,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    visitDate: admin.firestore.Timestamp.now(),
  };
  await db.collection("records").doc(recordId).set(record);
}

async function mintIdToken(uid: string): Promise<string> {
  // The Auth emulator accepts custom tokens minted with the admin SDK and
  // exchanges them for ID tokens via the emulator REST endpoint.
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
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
  const json = (await res.json()) as { result?: unknown; error?: { message: string; status: string } };
  if (json.error) {
    const err = new Error(json.error.message) as Error & { code: string };
    err.code = json.error.status?.toLowerCase().replace(/_/g, "-") ?? "unknown";
    throw err;
  }
  return json.result;
}

async function waitForAuditEntry(
  actionType: string,
  shareId: string,
  timeoutMs = 3000
): Promise<admin.firestore.QueryDocumentSnapshot> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db
      .collection("auditLog")
      .where("actionType", "==", actionType)
      .where("shareId", "==", shareId)
      .get();
    if (!snap.empty) return snap.docs[0]!;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Audit entry ${actionType} for share ${shareId} not found within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("share lifecycle integration", () => {
  it("initiateShare creates a ShareGrant and ShareCode for a code share", async () => {
    const recordId = "share-int-initiate";
    await seedRecord(recordId, SENDER_UID);
    const token = await mintIdToken(SENDER_UID);

    const result = (await callFunction(
      "initiateShare",
      { recordId, method: "code", expiry: "1h" },
      token
    )) as { shareId: string; code: string; expiresAt: string };

    expect(result.shareId).toBeDefined();
    expect(result.code).toMatch(/^[0-9A-Z]{6}$/);
    expect(result.expiresAt).toBeDefined();

    const grantSnap = await db.collection("shares").doc(result.shareId).get();
    expect(grantSnap.exists).toBe(true);
    const grant = grantSnap.data() as ShareGrant;
    expect(grant.status).toBe("pending");
    expect(grant.recordId).toBe(recordId);
    expect(grant.senderUid).toBe(SENDER_UID);

    const codeSnap = await db.collection("shareCodes").doc(result.code).get();
    expect(codeSnap.exists).toBe(true);
    const code = codeSnap.data() as ShareCode;
    expect(code.used).toBe(false);
    expect(code.shareId).toBe(result.shareId);
  });

  it("acceptShare transitions grant to accepted and marks code used", async () => {
    const recordId = "share-int-accept";
    await seedRecord(recordId, SENDER_UID);
    const senderToken = await mintIdToken(SENDER_UID);
    const recipientToken = await mintIdToken(RECIPIENT_UID);

    const initResult = (await callFunction(
      "initiateShare",
      { recordId, method: "code", expiry: "1h" },
      senderToken
    )) as { shareId: string; code: string };

    const acceptResult = (await callFunction(
      "acceptShare",
      { code: initResult.code },
      recipientToken
    )) as { shareId: string; recordId: string; senderUid: string; encryptedPayload: string };

    expect(acceptResult.shareId).toBe(initResult.shareId);
    expect(acceptResult.recordId).toBe(recordId);
    expect(acceptResult.senderUid).toBe(SENDER_UID);
    expect(typeof acceptResult.encryptedPayload).toBe("string");
    expect(Buffer.from(acceptResult.encryptedPayload, "base64").length).toBeGreaterThan(0);

    const grantSnap = await db.collection("shares").doc(initResult.shareId).get();
    expect((grantSnap.data() as ShareGrant).status).toBe("accepted");
    expect((grantSnap.data() as ShareGrant).recipientUid).toBe(RECIPIENT_UID);

    const codeSnap = await db.collection("shareCodes").doc(initResult.code).get();
    expect((codeSnap.data() as ShareCode).used).toBe(true);

    const recordSnap = await db.collection("records").doc(recordId).get();
    const grants = (recordSnap.data() as Record<string, unknown>).grants as Record<string, boolean>;
    expect(grants?.[RECIPIENT_UID]).toBe(true);
  });

  it("revokeShare transitions grant to revoked and removes grants map entry", async () => {
    const recordId = "share-int-revoke";
    await seedRecord(recordId, SENDER_UID);
    const senderToken = await mintIdToken(SENDER_UID);
    const recipientToken = await mintIdToken(RECIPIENT_UID);

    const initResult = (await callFunction(
      "initiateShare",
      { recordId, method: "code", expiry: "1h" },
      senderToken
    )) as { shareId: string; code: string };

    await callFunction("acceptShare", { code: initResult.code }, recipientToken);

    const revokeResult = (await callFunction(
      "revokeShare",
      { shareId: initResult.shareId },
      senderToken
    )) as { shareId: string; revokedAt: string };

    expect(revokeResult.shareId).toBe(initResult.shareId);
    expect(revokeResult.revokedAt).toBeDefined();

    const grantSnap = await db.collection("shares").doc(initResult.shareId).get();
    expect((grantSnap.data() as ShareGrant).status).toBe("revoked");

    const recordSnap = await db.collection("records").doc(recordId).get();
    const grants = (recordSnap.data() as Record<string, unknown>).grants as Record<string, boolean> | undefined;
    expect(grants?.[RECIPIENT_UID]).toBeUndefined();
  });

  it("audit entries are written for initiate, accept, and revoke", async () => {
    const recordId = "share-int-audit";
    await seedRecord(recordId, SENDER_UID);
    const senderToken = await mintIdToken(SENDER_UID);
    const recipientToken = await mintIdToken(RECIPIENT_UID);

    const initResult = (await callFunction(
      "initiateShare",
      { recordId, method: "code", expiry: "1h" },
      senderToken
    )) as { shareId: string; code: string };

    await callFunction("acceptShare", { code: initResult.code }, recipientToken);
    await callFunction("revokeShare", { shareId: initResult.shareId }, senderToken);

    const initiateEntry = await waitForAuditEntry("share.initiate", initResult.shareId);
    expect((initiateEntry.data() as AuditEntry).actorUid).toBe(SENDER_UID);
    expect((initiateEntry.data() as AuditEntry).recordId).toBe(recordId);

    const acceptEntry = await waitForAuditEntry("share.accept", initResult.shareId);
    expect((acceptEntry.data() as AuditEntry).actorUid).toBe(RECIPIENT_UID);

    const revokeEntry = await waitForAuditEntry("share.revoke", initResult.shareId);
    expect((revokeEntry.data() as AuditEntry).actorUid).toBe(SENDER_UID);
  });

  it("acceptShare rejects an already-used code", async () => {
    const recordId = "share-int-used-code";
    await seedRecord(recordId, SENDER_UID);
    const senderToken = await mintIdToken(SENDER_UID);
    const recipientToken = await mintIdToken(RECIPIENT_UID);

    const initResult = (await callFunction(
      "initiateShare",
      { recordId, method: "code", expiry: "1h" },
      senderToken
    )) as { shareId: string; code: string };

    await callFunction("acceptShare", { code: initResult.code }, recipientToken);

    await expect(
      callFunction("acceptShare", { code: initResult.code }, recipientToken)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("initiateShare rejects when caller is not the record owner", async () => {
    const recordId = "share-int-not-owner";
    await seedRecord(recordId, SENDER_UID);
    const nonOwnerToken = await mintIdToken(RECIPIENT_UID);

    await expect(
      callFunction(
        "initiateShare",
        { recordId, method: "code", expiry: "1h" },
        nonOwnerToken
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });
});