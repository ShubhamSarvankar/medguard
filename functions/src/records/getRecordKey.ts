import * as functions from "firebase-functions";
import * as crypto from "crypto";
import { z } from "zod";
import { getRecord } from "../lib/firestoreAdmin";
import { unwrapDataKey } from "../lib/kmsClient";
import { writeAuditLog } from "../audit/writeAuditLog";

const requestSchema = z.object({
  recordId: z.string().min(1),
  // Client-generated ephemeral key; server re-encrypts the data key with it so plaintext never travels the wire.
  sessionKeyHex: z.string().length(64, "sessionKeyHex must be 64 hex characters (32 bytes)"),
});

// Returns base64(iv[12] + AES-256-GCM(dataKey) + authTag[16])
function encryptDataKeyForCaller(dataKey: Buffer, sessionKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

// Client decryption flow: generate ephemeral sessionKey → call getRecordKey → decrypt encryptedPayload to recover dataKey → decrypt encryptedFields.
// Recipients get the data key via acceptShare's encryptedPayload instead.
export const getRecordKey = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required."
    );
  }

  const callerUid = context.auth.uid;

  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid request."
    );
  }

  const { recordId, sessionKeyHex } = parsed.data;

  const record = await getRecord(recordId);
  if (!record) {
    throw new functions.https.HttpsError("not-found", "Record not found.");
  }
  if (record.ownerUid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only the record owner can retrieve the data key."
    );
  }
  if (!record.wrappedDataKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Record has no wrapped data key. Re-save the record to generate one."
    );
  }
  if (!record.encryptedFields) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Record has no encrypted fields."
    );
  }

  const wrappedKeyBuffer = Buffer.from(record.wrappedDataKey, "base64");
  const dataKey = await unwrapDataKey(callerUid, wrappedKeyBuffer);
  const sessionKey = Buffer.from(sessionKeyHex, "hex");
  const encryptedPayload = encryptDataKeyForCaller(dataKey, sessionKey);

  await writeAuditLog({
    actorUid: callerUid,
    actionType: "record.read",
    recordId,
  });

  return {
    encryptedPayload,
    recordId,
  };
});
