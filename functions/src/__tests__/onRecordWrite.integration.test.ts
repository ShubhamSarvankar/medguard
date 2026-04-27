import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as admin from "firebase-admin";
import type { MedicalRecord } from "@medguard/types";

// Emulator connection is configured via environment variables set in
// vitest.integration.config.ts:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

let db: admin.firestore.Firestore;

beforeAll(() => {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "medguard-dev" });
  }
  db = admin.firestore();
});

async function waitForDeidentification(
  recordId: string,
  timeoutMs = 5000
): Promise<admin.firestore.DocumentSnapshot> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db.collection("records").doc(recordId).get();
    if (snap.exists && (snap.data() as MedicalRecord).isDeidentified) {
      return snap;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Record ${recordId} was not de-identified within ${timeoutMs}ms`);
}

afterEach(async () => {
  const batch = db.batch();
  const records = await db.collection("records").get();
  records.docs.forEach((d) => batch.delete(d.ref));
  const audit = await db.collection("auditLog").get();
  audit.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
});

describe("onRecordWrite integration", () => {
  it("encrypts de-identified fields and sets isDeidentified: true (T03)", async () => {
    const recordId = "test-record-encrypt-notes";
    const raw: Partial<MedicalRecord> = {
      recordId,
      ownerUid: "test-patient-uid",
      createdByUid: "test-patient-uid",
      status: "active",
      title: "Visit record",
      notes: "Patient Name: Test Patient Alpha. SSN: 234-56-7890. DOB: 01/15/1980.",
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
    const result = snap.data() as Record<string, unknown>;

    // isDeidentified flag set
    expect(result.isDeidentified).toBe(true);

    // encryptedFields blob present and is valid base64 (T03)
    expect(typeof result.encryptedFields).toBe("string");
    expect(result.encryptedFields as string).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // wrappedDataKey present
    expect(typeof result.wrappedDataKey).toBe("string");

    // Plaintext PHI fields removed from Firestore document (T03)
    expect(result.notes).toBeUndefined();
    expect(result.title).toBeUndefined();
    expect(result.medications).toBeUndefined();
    expect(result.diagnoses).toBeUndefined();

    // Non-PHI metadata fields still present
    expect(result.ownerUid).toBe("test-patient-uid");
    expect(result.recordId).toBe(recordId);
  });

  it("encrypts PHI in title field", async () => {
    const recordId = "test-record-encrypt-title";
    const raw: Partial<MedicalRecord> = {
      recordId,
      ownerUid: "test-patient-uid",
      createdByUid: "test-patient-uid",
      status: "active",
      title: "Visit with Dr. Test Physician on 04/10/2024",
      notes: "Routine checkup.",
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
    const result = snap.data() as Record<string, unknown>;

    expect(result.isDeidentified).toBe(true);
    expect(result.encryptedFields).toBeDefined();
    // Plaintext title not stored at top level
    expect(result.title).toBeUndefined();
    expect(result.wrappedDataKey).toBeDefined();
  });

  it("encrypts PHI in medication and diagnosis fields", async () => {
    const recordId = "test-record-encrypt-nested";
    const raw: Partial<MedicalRecord> = {
      recordId,
      ownerUid: "test-patient-uid",
      createdByUid: "test-patient-uid",
      status: "active",
      title: "Medication review",
      notes: "See attached.",
      medications: [
        {
          name: "Prescribed by Dr. Test Physician",
          doseAmount: "500mg",
          doseUnit: "mg",
          frequency: "twice daily",
        },
      ],
      diagnoses: [
        {
          code: "J06.9",
          description: "Upper respiratory infection — Patient: Test Beta, onset 03/01/2024",
          diagnosedAt: admin.firestore.Timestamp.now(),
        },
      ],
      attachments: [],
      isDeidentified: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      visitDate: admin.firestore.Timestamp.now(),
    };

    await db.collection("records").doc(recordId).set(raw);
    const snap = await waitForDeidentification(recordId);
    const result = snap.data() as Record<string, unknown>;

    expect(result.isDeidentified).toBe(true);
    expect(result.encryptedFields).toBeDefined();
    // Nested PHI fields not at top level
    expect(result.medications).toBeUndefined();
    expect(result.diagnoses).toBeUndefined();
  });

  it("writes an ai.deidentify audit entry after de-identification", async () => {
    const recordId = "test-record-audit-check";
    const raw: Partial<MedicalRecord> = {
      recordId,
      ownerUid: "test-patient-uid",
      createdByUid: "test-patient-uid",
      status: "active",
      title: "Audit test",
      notes: "Patient email: test.phi@example.com",
      medications: [],
      diagnoses: [],
      attachments: [],
      isDeidentified: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      visitDate: admin.firestore.Timestamp.now(),
    };

    await db.collection("records").doc(recordId).set(raw);
    await waitForDeidentification(recordId);

    const auditDeadline = Date.now() + 5000;
    let auditSnap = await db
      .collection("auditLog")
      .where("actionType", "==", "ai.deidentify")
      .where("recordId", "==", recordId)
      .get();

    while (auditSnap.empty && Date.now() < auditDeadline) {
      await new Promise((r) => setTimeout(r, 300));
      auditSnap = await db
        .collection("auditLog")
        .where("actionType", "==", "ai.deidentify")
        .where("recordId", "==", recordId)
        .get();
    }

    expect(auditSnap.empty).toBe(false);
    const entry = auditSnap.docs[0].data();
    expect(entry.actionType).toBe("ai.deidentify");
    expect(entry.recordId).toBe(recordId);
    expect(entry.aiFunction).toBe("onRecordWrite");
    expect(entry.actorUid).toBe("test-patient-uid");
  });

  it("skips re-processing when isDeidentified is already true", async () => {
    const recordId = "test-record-skip";
    const alreadyClean: Partial<MedicalRecord> = {
      recordId,
      ownerUid: "test-patient-uid",
      createdByUid: "test-patient-uid",
      status: "active",
      isDeidentified: true,
      encryptedFields: "dGVzdA==",
      wrappedDataKey: "dGVzdA==",
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      visitDate: admin.firestore.Timestamp.now(),
    };

    await db.collection("records").doc(recordId).set(alreadyClean);

    await new Promise((r) => setTimeout(r, 1000));

    const auditSnap = await db
      .collection("auditLog")
      .where("actionType", "==", "ai.deidentify")
      .where("recordId", "==", recordId)
      .get();

    expect(auditSnap.empty).toBe(true);
  });
});
