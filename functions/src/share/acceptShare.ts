import * as functions from "firebase-functions";
import * as crypto from "crypto";
import { z } from "zod";
import type { ShareGrant } from "@medguard/types";
import {
  getShareGrant,
  getShareCode,
  getRecord,
  updateShareGrant,
  updateShareCode,
  updateRecord,
  serverTimestamp,
  db,
} from "../lib/firestoreAdmin";
import { unwrapDataKey } from "../lib/kmsClient";
import { writeAuditLog } from "../audit/writeAuditLog";
import { checkRateLimit } from "../lib/rateLimiter";

const requestSchema = z.object({
  shareId: z.string().optional(),
  code: z.string().optional(),
});

// tap share: session key = ECDH shared secret (sessionKeyHex from Android NFC handshake)
// code share: session key = HKDF(ikm=code, salt=shareId, info="medguard-code-share")
// Returns base64(iv[12] + ciphertext + authTag[16]) — AES-256-GCM.
function encryptDataKeyForRecipient(
  dataKey: Buffer,
  sessionKey: Buffer
): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

function deriveSessionKeyFromCode(code: string, shareId: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(code),
      Buffer.from(shareId),
      Buffer.from("medguard-code-share"),
      32
    )
  );
}

async function resolveGrant(
  shareId?: string,
  code?: string
): Promise<{ grant: ShareGrant; resolvedCode?: string }> {
  if (shareId) {
    const grant = await getShareGrant(shareId);
    if (!grant) {
      throw new functions.https.HttpsError("not-found", "Share not found.");
    }
    return { grant };
  }

  if (code) {
    const codeDoc = await getShareCode(code);
    if (!codeDoc) {
      throw new functions.https.HttpsError("not-found", "Share code not found.");
    }
    const grant = await getShareGrant(codeDoc.shareId);
    if (!grant) {
      throw new functions.https.HttpsError("not-found", "Share not found.");
    }
    return { grant, resolvedCode: code };
  }

  throw new functions.https.HttpsError(
    "invalid-argument",
    "Provide either shareId or code."
  );
}

export const acceptShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const recipientUid = context.auth.uid;

  // T06: 10 attempts/min per user — brute-force protection against share-code guessing.
  await checkRateLimit(recipientUid, "acceptShare", 10, 60 * 1000);

  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid request."
    );
  }

  const { shareId: reqShareId, code } = parsed.data;

  const { grant, resolvedCode } = await resolveGrant(reqShareId, code);

  if (resolvedCode) {
    const codeDoc = await getShareCode(resolvedCode);
    if (!codeDoc) {
      throw new functions.https.HttpsError("not-found", "Share code not found.");
    }
    if (codeDoc.used) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Share code has already been used."
      );
    }
    const now = Date.now();
    if (codeDoc.expiresAt.toMillis() < now) {
      throw new functions.https.HttpsError("deadline-exceeded", "Share code has expired.");
    }
  }

  if (grant.status === "revoked") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This share has been revoked."
    );
  }
  if (grant.status === "expired") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This share has expired."
    );
  }
  if (grant.status === "accepted") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This share has already been accepted."
    );
  }

  if (grant.method === "tap" && grant.recipientUid !== recipientUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not the intended recipient of this share."
    );
  }

  if (grant.expiresAt && grant.expiresAt.toMillis() < Date.now()) {
    throw new functions.https.HttpsError(
      "deadline-exceeded",
      "This share has expired."
    );
  }

  const record = await getRecord(grant.recordId);
  if (!record) {
    throw new functions.https.HttpsError("not-found", "Record not found.");
  }
  if (!record.wrappedDataKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Record has no wrapped data key. Re-save the record to generate one."
    );
  }

  const wrappedKeyBuffer = Buffer.from(record.wrappedDataKey, "base64");
  const dataKey = await unwrapDataKey(grant.senderUid, wrappedKeyBuffer);

  let sessionKey: Buffer;
  if (grant.method === "code" && resolvedCode) {
    sessionKey = deriveSessionKeyFromCode(resolvedCode, grant.shareId);
  } else {
    // Tap share: server cannot reconstruct the ECDH session key; client passes sessionKeyHex from the NFC handshake.
    const sessionKeyHex = (data as Record<string, unknown>).sessionKeyHex;
    if (typeof sessionKeyHex !== "string" || sessionKeyHex.length !== 64) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "sessionKeyHex required for tap shares."
      );
    }
    sessionKey = Buffer.from(sessionKeyHex, "hex");
  }

  const encryptedPayload = encryptDataKeyForRecipient(dataKey, sessionKey);
  const now = serverTimestamp();

  const batch = db.batch();

  batch.update(db.collection("shares").doc(grant.shareId), {
    status: "accepted",
    recipientUid,
    acceptedAt: now,
  });

  if (resolvedCode) {
    batch.update(db.collection("shareCodes").doc(resolvedCode), { used: true });
  }

  batch.update(db.collection("records").doc(grant.recordId), {
    [`grants.${recipientUid}`]: true,
  });

  await batch.commit();

  await writeAuditLog({
    actorUid: recipientUid,
    actionType: "share.accept",
    recordId: grant.recordId,
    shareId: grant.shareId,
  });

  return {
    shareId: grant.shareId,
    recordId: grant.recordId,
    senderUid: grant.senderUid,
    encryptedPayload,
  };
});
