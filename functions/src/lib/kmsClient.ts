import * as crypto from "crypto";

// PRODUCTION SWAP ─────────────────────────────────────────────────────────────
// Replace the entire implementation below with the Google Cloud KMS SDK:
//
//   import { KeyManagementServiceClient } from "@google-cloud/kms";
//
//   const kmsClient = new KeyManagementServiceClient();
//
//   function keyName(uid: string): string {
//     return kmsClient.cryptoKeyPath(
//       process.env.KMS_PROJECT_ID!,
//       process.env.KMS_LOCATION!,
//       process.env.KMS_KEY_RING!,
//       uid,
//     );
//   }
//
//   export async function wrapDataKey(uid: string, dataKey: Buffer): Promise<Buffer> {
//     const [result] = await kmsClient.encrypt({
//       name: keyName(uid),
//       plaintext: dataKey,
//     });
//     return Buffer.from(result.ciphertext as Uint8Array);
//   }
//
//   export async function unwrapDataKey(uid: string, wrappedKey: Buffer): Promise<Buffer> {
//     const [result] = await kmsClient.decrypt({
//       name: keyName(uid),
//       ciphertext: wrappedKey,
//     });
//     return Buffer.from(result.plaintext as Uint8Array);
//   }
//
//   export async function createUserKey(uid: string): Promise<void> {
//     const keyRing = kmsClient.keyRingPath(
//       process.env.KMS_PROJECT_ID!,
//       process.env.KMS_LOCATION!,
//       process.env.KMS_KEY_RING!,
//     );
//     await kmsClient.createCryptoKey({
//       parent: keyRing,
//       cryptoKeyId: uid,
//       cryptoKey: { purpose: "ENCRYPT_DECRYPT" },
//     });
//   }
//
// Required IAM role on the Cloud Functions service account:
//   roles/cloudkms.cryptoKeyEncrypterDecrypter
//
// Required package: @google-cloud/kms (add to functions/package.json dependencies)
// ─────────────────────────────────────────────────────────────────────────────

// Portfolio implementation: AES-256-KW using Node's built-in crypto module.
// The wrap/unwrap contract is identical to the production KMS interface —
// callers are unaffected by this substitution.

// Each user's key encryption key (KEK) is derived deterministically from their
// UID using HKDF. In production this derivation is replaced by the KMS key
// lookup above — the UID maps to a KMS key name rather than a derived key.
function deriveKek(uid: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(uid),
      Buffer.from("medguard-kek-salt"),
      Buffer.from("medguard-kek"),
      32,
    ),
  );
}

export async function wrapDataKey(uid: string, dataKey: Buffer): Promise<Buffer> {
  const kek = deriveKek(uid);
  // AES-256-KW (RFC 3394) — wraps the data key with the user's KEK.
  const wrappedKey = crypto.createCipheriv("id-aes256-wrap-pad", kek, Buffer.alloc(4, 0xa6))
    .update(dataKey);
  return wrappedKey;
}

export async function unwrapDataKey(uid: string, wrappedKey: Buffer): Promise<Buffer> {
  const kek = deriveKek(uid);
  try {
    const unwrapped = crypto.createDecipheriv("id-aes256-wrap-pad", kek, Buffer.alloc(4, 0xa6))
      .update(wrappedKey);
    return unwrapped;
  } catch {
    throw new Error(`Key unwrap failed for uid ${uid} — wrong key or corrupted data`);
  }
}

export async function createUserKey(_uid: string): Promise<void> {
  // In production: creates a new KMS CryptoKey for the user.
  // In this mock: the key is derived on demand from the UID — no pre-creation needed.
}