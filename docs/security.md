# Security

## Threat model summary

Full threat model: [`medguard-threat-model.md`](medguard-threat-model.md). Ten threats analyzed via STRIDE. All controls implemented or documented with `// PRODUCTION SWAP` markers.

| ID | Threat | Control | Status |
|---|---|---|---|
| T01 | Account takeover | Passkeys + TOTP MFA, biometric-bound keys, session timeouts (15 min Android / 60 min web) | Implemented |
| T02 | MITM on HTTPS | TLS 1.3 minimum, certificate pinning (OkHttp CertificatePinner), App Check | Placeholder pins |
| T03 | Firestore exfiltration | AES-256-GCM field encryption + mandatory PHI de-identification + Firestore security rules | Implemented |
| T04 | Local device compromise | Android Keystore (StrongBox/TEE) + BiometricPrompt + SQLCipher | SQLCipher deferred |
| T05 | P2P interception | ECDH P-256 ephemeral keys via NFC, AES-GCM payload encryption | Implemented |
| T06 | Share code brute force | Cryptographically random 6-char Base36, 10 min expiry, single-use, rate limiting (10/min) | Implemented |
| T07 | Audit log tampering | Append-only Firestore collection, Cloud Functions write only, client write blocked by rules | Implemented |
| T08 | PHI leakage via AI | Mandatory `onRecordWrite` trigger, two-stage de-identification, no PHI in logs | Implemented (mock NLP) |
| T09 | Care circle privilege escalation | Per-record grants (not role-based), instant revocation via Firestore rules, owner audit visibility | Implemented |
| T10 | DoS on Cloud Functions | App Check, per-UID rate limiting on share/summarize endpoints | Implemented |

## Encryption at rest

**Firestore**: Per-record AES-256-GCM data key encrypts all record fields into a single `encryptedFields` blob. The data key is wrapped by a per-user KEK via Cloud KMS (mocked with AES-256-KW for portfolio). Plaintext fields are deleted from the document after encryption.

**Android**: Room database encrypted with SQLCipher (deferred; `PRODUCTION SWAP` in `MedGuardDatabase.kt`). Encryption key stored in Android Keystore with StrongBox preference, requiring biometric authentication on every use.

## Encryption in transit

TLS 1.3 enforced on all client-server traffic. Certificate pinning configured in `network_security_config.xml` (placeholder hashes; `PRODUCTION SWAP` in `NetworkModule.kt` documents the `openssl` extraction command).

P2P payloads encrypted with ephemeral ECDH session keys derived via HKDF. Session keys are never persisted or reused.

## PHI de-identification pipeline

Two-stage process running as a Firestore `onWrite` trigger:

1. **Entity extraction**: Claude via AWS Bedrock (mocked) identifies PHI entities as structured JSON.
2. **Deterministic replacement**: Each entity value is replaced with a typed placeholder (e.g. `[PATIENT_NAME]`), processing entity types in container-before-substring order to prevent partial-match corruption.

No record reaches Firestore without passing through this pipeline. The trigger's `isDeidentified` flag provides idempotency.

## Access control

Firestore security rules enforce per-user scoping. The `grants` map on record documents enables shared access. Audit log entries are client-write-blocked.

Rate limiting uses a Firestore counter pattern with TTL windows per UID per function.

## HIPAA alignment

| HIPAA requirement | Control |
|---|---|
| Access controls (§164.312(a)) | Firebase Auth + passkeys + MFA + biometric |
| Audit controls (§164.312(b)) | Append-only audit log, 7-year retention |
| Integrity (§164.312(c)) | Field encryption, digital signatures on share payloads |
| Transmission security (§164.312(e)) | TLS 1.3, certificate pinning, ECDH session keys |
| Right to delete | `deleteUserData` + `processAccountDeletions` (30-day scheduled) |
| Minimum necessary (§164.502(b)) | Caretakers see only own audit entries; per-record share grants |

## Production swap checklist

These modules use mock implementations marked with `// PRODUCTION SWAP`:

| Module | Mock | Production replacement |
|---|---|---|
| `kmsClient.ts` | Node `crypto` AES-256-KW | `@google-cloud/kms` |
| `phiExtractClient.ts` | Regex pattern matching | `@aws-sdk/client-bedrock-runtime` (Claude structured output) |
| `bedrockClient.ts` | Hardcoded summary | `@aws-sdk/client-bedrock-runtime` |
| `NetworkModule.kt` | Placeholder pin hashes | Real certificate hashes via `openssl` |
| `MedGuardDatabase.kt` | Unencrypted Room | SQLCipher `SupportFactory` |