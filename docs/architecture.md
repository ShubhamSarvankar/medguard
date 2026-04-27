# Architecture

## System overview

MedGuard is a cross-platform medical records system with two clients (Android native, React web), a Firebase backend, and a mandatory AI-driven PHI de-identification pipeline. Identifiable records never leave the originating device. Firestore stores only de-identified, field-encrypted data.

```
┌──────────────┐       TLS 1.3       ┌───────────────────────────┐       IAM       ┌───────────┐
│  Android app │◄────────────────────►│  Firebase Cloud Functions │◄───────────────►│ Cloud KMS │
│  (Compose)   │                      │  (Node 20 / TypeScript)   │                 └───────────┘
└──────┬───────┘                      │                           │       SDK       ┌───────────┐
       │ NFC + Nearby                 │  onRecordWrite trigger    │◄───────────────►│ Bedrock   │
       │ Connections                  │  19 callable/scheduled fn │                 │ (Claude)  │
┌──────┴───────┐                      └─────────┬─────────────────┘                 └───────────┘
│  Android app │                                │
│  (peer)      │                      ┌─────────▼─────────────────┐
└──────────────┘                      │  Firestore  │  Auth       │
                                      │  Storage    │  App Check  │
┌──────────────┐       TLS 1.3       │  Hosting    │             │
│  React web   │◄────────────────────►└─────────────────────────────┘
│  dashboard   │
└──────────────┘
```

## Data flow

1. User creates a record on Android. It is stored in Room (encrypted locally) and sent to the `createRecord` Cloud Function.
2. `createRecord` writes to Firestore, triggering `onRecordWrite`.
3. `onRecordWrite` runs the two-stage PHI de-identification pipeline, encrypts record fields with the per-record AES-256-GCM data key, wraps the data key with the owner's KMS KEK, writes the result, and logs an audit entry.
4. The web dashboard reads de-identified records from Firestore. On-demand summaries go through `summarizeRecord` (Claude via Bedrock).
5. Sharing: `initiateShare` creates a grant + optional share code. `acceptShare` unwraps the sender's data key and re-encrypts it with a session key derived from the share code (HKDF) or NFC/ECDH handshake.

## Encryption

```
Plaintext record fields
  → AES-256-GCM with per-record data key
    → Data key wrapped by per-user KEK (Cloud KMS / mock AES-256-KW)
      → Stored as wrappedDataKey + encryptedFields blob in Firestore
```

Tap-to-share: NFC foreground dispatch exchanges ECDH P-256 public keys. HKDF derives a session key. Payload transfers over Nearby Connections encrypted with that session key.

Code share: session key = HKDF(ikm=code, salt=shareId, info="medguard-code-share"). Server re-encrypts the data key with this session key.

## Android architecture

MVVM with Hilt DI. Room + Tink for local encrypted storage. Android Keystore (StrongBox/TEE) guards the encryption key behind BiometricPrompt. Coroutines + Flow throughout. Offline reads from Room; writes blocked until connectivity returns (idempotent sync).

## Web architecture

React 18 + TypeScript strict. TanStack Query for server state, Zustand for auth state. React Hook Form + Zod for validation. Tailwind + shadcn/ui. Firebase client SDK connects to emulators in dev via `VITE_USE_EMULATORS`.

## Cloud Functions

19 functions: 1 Firestore trigger (`onRecordWrite`), 1 scheduled (`processAccountDeletions`), 1 scheduled (`expireShareCodes`), 16 HTTPS callables. All require Firebase Auth. Zod validates every request. No PHI in logs.

## Firestore collections

| Collection | Purpose |
|---|---|
| `records/{id}` | De-identified, field-encrypted medical records |
| `records/{id}/annotations/{id}` | Clinician annotations |
| `records/{id}/attachmentMeta/{id}` | Attachment metadata |
| `pendingRecords/{id}` | Caretaker drafts awaiting patient approval |
| `shares/{id}` | Share grants (pending/accepted/revoked/expired) |
| `shareCodes/{code}` | Short-lived share codes (10 min TTL) |
| `auditLog/{id}` | Append-only audit trail (Cloud Functions write only) |
| `users/{uid}` | User profile |
| `users/{uid}/careCircle/{uid}` | Care circle membership |
| `deletionRequests/{id}` | Scheduled account deletions (30-day delay) |