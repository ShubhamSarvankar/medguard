import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require("@google-cloud/firestore") as { Timestamp: typeof import("@google-cloud/firestore").Timestamp };
import { z } from "zod";
import type { ShareGrant, ShareCode, ShareExpiry } from "@medguard/types";
import {
  getRecord,
  getUser,
  setShareGrant,
  setShareCode,
  serverTimestamp,
} from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";
import { checkRateLimit } from "../lib/rateLimiter";

const CODE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;

const requestSchema = z.object({
  recordId: z.string().min(1),
  method: z.enum(["tap", "code"]),
  recipientUid: z.string().optional(),
  expiry: z.enum(["1h", "24h", "7d", "permanent"]),
});

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
}

function expiresAtForExpiry(
  expiry: ShareExpiry
): FirebaseFirestore.Timestamp | undefined {
  if (expiry === "permanent") return undefined;
  const ms: Record<Exclude<ShareExpiry, "permanent">, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  return Timestamp.fromMillis(Date.now() + ms[expiry]) as unknown as FirebaseFirestore.Timestamp;
}

export const initiateShare = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const senderUid = context.auth.uid;

  // T10: 20 requests/hour per user — DoS protection.
  await checkRateLimit(senderUid, "initiateShare", 20, 60 * 60 * 1000);

  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Invalid request."
    );
  }

  const { recordId, method, recipientUid, expiry } = parsed.data;

  if (method === "tap" && !recipientUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "recipientUid is required for tap shares."
    );
  }

  const record = await getRecord(recordId);
  if (!record || record.ownerUid !== senderUid) {
    throw new functions.https.HttpsError(
      "not-found",
      "Record not found or caller is not the owner."
    );
  }

  if (recipientUid) {
    const recipient = await getUser(recipientUid);
    if (!recipient) {
      throw new functions.https.HttpsError("not-found", "Recipient user not found.");
    }
  }

  const shareId = uuidv4();
  const now = serverTimestamp();
  const expiresAt = expiresAtForExpiry(expiry);

  const grant: ShareGrant = {
    shareId,
    recordId,
    senderUid,
    recipientUid: recipientUid ?? "",
    method,
    status: "pending",
    expiry,
    createdAt: now,
    ...(expiresAt !== undefined && { expiresAt }),
  };

  await setShareGrant(shareId, grant);

  let code: string | undefined;

  if (method === "code") {
    code = generateCode();
    const codeDoc: ShareCode = {
      code,
      shareId,
      recordId,
      senderUid,
      expiresAt: Timestamp.fromMillis(Date.now() + CODE_TTL_MS) as unknown as FirebaseFirestore.Timestamp,
      used: false,
    };
    await setShareCode(code, codeDoc);
  }

  await writeAuditLog({
    actorUid: senderUid,
    actionType: "share.initiate",
    recordId,
    shareId,
  });

  return {
    shareId,
    ...(code !== undefined && { code }),
    ...(expiresAt !== undefined && { expiresAt: expiresAt.toDate().toISOString() }),
  };
});
