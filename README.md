# MedGuard

A cross-platform medical records system with end-to-end encryption, mandatory PHI de-identification, and HIPAA-aware audit logging. Two clients (Android + React web), Firebase backend, 19 Cloud Functions, and an AI pipeline that strips protected health information before any record reaches the database.

Built as an extension of a project done for INFSCI 2150 - Information Security and Privacy.

## Why this project

Healthcare software has a unique constraint: it must handle sensitive data correctly at every layer, not just at the API boundary. MedGuard demonstrates that constraint across the full stack by making PHI de-identification a mandatory database trigger (not an optional middleware), encrypting record fields with per-record keys managed through envelope encryption, and enforcing access control at both the Firestore rules layer and the cryptographic layer so that a database dump alone is insufficient to read patient data.

## Architecture

```
┌──────────────┐                      ┌───────────────────────────┐                 ┌───────────┐
│  Android app │◄── TLS 1.3 ────────►│  Firebase Cloud Functions │◄──── IAM ──────►│ Cloud KMS │
│  Kotlin      │                      │  Node 20 / TypeScript     │                 └───────────┘
│  Compose     │                      │  19 functions              │                 ┌───────────┐
└──────┬───────┘                      │                           │◄──── SDK ──────►│ Bedrock   │
       │ NFC + Nearby                 └─────────┬─────────────────┘                 │ (Claude)  │
       │ Connections                            │                                   └───────────┘
┌──────┴───────┐                      ┌─────────▼─────────────────┐
│  Android app │                      │  Firestore · Auth         │
│  (peer)      │                      │  Storage · App Check      │
└──────────────┘                      │  Hosting                  │
                                      └─────────▲─────────────────┘
┌──────────────┐                                │
│  React web   │◄── TLS 1.3 ────────────────────┘
│  dashboard   │
└──────────────┘
```

Every record follows this path:

1. Created on device (stored encrypted in Room)
2. Sent to `createRecord` Cloud Function
3. `onRecordWrite` trigger runs PHI de-identification (two-stage: entity extraction + deterministic replacement)
4. Record fields encrypted with per-record AES-256-GCM key, key wrapped by per-user KEK
5. Written to Firestore as an opaque `encryptedFields` blob + `wrappedDataKey`
6. Audit entry logged (Cloud Functions only, append-only)

Full architecture details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Key features

**Encryption at every layer.** Per-record AES-256-GCM data keys wrapped by per-user KEKs via Cloud KMS. Android local database encrypted with Keystore-backed keys requiring biometric authentication. P2P sharing uses ECDH ephemeral session keys over NFC handshake. Even with full Firestore access, record content is unreadable without the corresponding data key.

**Mandatory PHI de-identification.** Implemented as a Firestore `onWrite` trigger that cannot be bypassed. Two-stage pipeline: Claude (via Bedrock) extracts PHI entities as structured JSON, then a deterministic replacement engine substitutes typed placeholders. Records in Firestore contain `[PATIENT_NAME]`, `[SSN]`, `[PHYSICIAN_NAME]`, etc. instead of real values.

**Tap-to-share.** NFC foreground dispatch exchanges ECDH P-256 public keys at close range (physical proximity = authentication). HKDF derives a one-time session key. Record payload transfers over Google Nearby Connections encrypted with that session key. Code-based sharing uses HKDF(code, shareId) for remote recipients.

**Append-only audit log.** Every record access, share event, AI operation, and account action produces an audit entry. Firestore security rules block all client writes to the audit collection. Only Cloud Functions can append. Entries are retained 7 years; deleted accounts have their actor UID anonymized but entries preserved.

**Caretaker/clinician workflows.** Caretakers draft records in a staging collection; patients must approve before the record enters the de-identification pipeline. Clinicians add annotations to shared records as a separate sub-collection that never modifies the original record fields.

**Account deletion.** `deleteUserData` schedules deletion 30 days out. `processAccountDeletions` (daily scheduled function) deletes all Firestore documents, Storage blobs, and the Firebase Auth account. Audit entries are anonymized, not deleted.

## Tech stack

| Layer | Technology |
|---|---|
| Android | Kotlin 2.x, Jetpack Compose, Hilt, Room, Tink, Android Keystore, BiometricPrompt, Nearby Connections, NFC |
| Web | React 18, TypeScript strict, TanStack Query, Zustand, React Hook Form, Zod, Tailwind CSS, shadcn/ui |
| Backend | Firebase Auth (passkeys + TOTP MFA), Firestore, Cloud Functions (Node 20), Cloud KMS, App Check |
| AI | Claude via AWS Bedrock for PHI entity extraction and plain-language summaries |
| Testing | JUnit 5 + Mockk (Android), Vitest + RTL (web), Playwright (E2E), Firebase Emulator Suite |

## Project structure

```
medguard/
├── android/          Kotlin + Jetpack Compose (63 source files, ~6.9k lines)
├── web/              React 18 + TypeScript (45 source files, ~5.0k lines)
├── functions/        Cloud Functions (52 source files, ~7.2k lines)
├── types/            Shared TypeScript types
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── storage.rules
```

## Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `onRecordWrite` | Firestore trigger | PHI de-identification + field encryption |
| `createRecord` | Callable | Validated record creation |
| `submitRecordForApproval` | Callable | Caretaker submits draft for patient review |
| `approveRecord` / `rejectRecord` | Callable | Patient approves or rejects draft |
| `createAnnotation` / `updateAnnotation` / `deleteAnnotation` | Callable | Clinician annotation CRUD |
| `getRecordKey` | Callable | Owner retrieves unwrapped data key |
| `initiateShare` | Callable | Generate share grant + optional code |
| `acceptShare` | Callable | Claim share, receive re-encrypted data key |
| `revokeShare` | Callable | Revoke access (immediate Firestore rule enforcement) |
| `expireShareCodes` | Scheduled (5 min) | Clean up expired share codes |
| `summarizeRecord` | Callable | AI-generated plain-language summary |
| `inviteToCareCircle` / `acceptCareCircleInvite` / `removeCareCircleMember` | Callable | Care circle management |
| `deleteUserData` | Callable | Schedule account deletion |
| `processAccountDeletions` | Scheduled (daily) | Execute pending deletions |

## Testing

355 test cases across three layers:

| Layer | Framework | Count |
|---|---|---|
| Cloud Functions unit | Vitest | 203 |
| Cloud Functions integration | Vitest + Firebase Emulator | 27 |
| Web unit | Vitest + React Testing Library | 50 |
| Web E2E | Playwright | 6 |
| Android unit | JUnit 5 + Mockk | 64 |
| Android E2E | Compose UI Test | 5 |

All 6 Playwright E2E tests pass against the Firebase Emulator Suite: registration + CRUD, code share, audit export, AI summary, and account deletion.

## Security posture

Ten threats analyzed via STRIDE methodology. Full threat model: [`docs/medguard-threat-model.md`](docs/medguard-threat-model.md). Security controls: [`docs/SECURITY.md`](docs/SECURITY.md).

Highlights: passkey authentication with TOTP MFA (no SMS), envelope encryption with per-record keys, mandatory PHI de-identification as a database trigger, certificate pinning, rate limiting on share endpoints (10 attempts/min), append-only audit log with 7-year retention.

## Portfolio mock overrides disclaimer

Several components use mock implementations with `// PRODUCTION SWAP` comments documenting the real integration:

| Component | Mock | Production |
|---|---|---|
| Cloud KMS | Node `crypto` AES-256-KW | `@google-cloud/kms` |
| PHI extraction | Regex pattern matching | Claude via Bedrock (structured output) |
| AI summaries | Hardcoded response | Claude via Bedrock |
| Certificate pins | Placeholder hashes | Real certificate hashes |
| SQLCipher | Unencrypted Room | SQLCipher `SupportFactory` |

All business logic, encryption, security rules, access control, and audit logging are real. Only the external service integrations (KMS, Bedrock) and device-specific security features (certificate pinning, SQLCipher) are mocked.

## Local development

See [`docs/SETUP.md`](docs/SETUP.md) for step-by-step instructions. In short:

```bash
cd types && npm install && npm run build && cd ..
cd functions && npm install && cd ..
cd web && npm install && cd ..
firebase emulators:start          # terminal 1
cd web && npm run dev             # terminal 2
cd web && npx playwright test     # terminal 3 (E2E)
```

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, data flow, encryption model |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model summary, controls, HIPAA alignment |
| [`docs/SETUP.md`](docs/SETUP.md) | Local development setup |
| [`docs/medguard-requirements.md`](docs/medguard-requirements.md) | Functional and non-functional requirements |
| [`docs/medguard-api-contracts.md`](docs/medguard-api-contracts.md) | Cloud Function API contracts |
| [`docs/medguard-data-models.md`](docs/medguard-data-models.md) | Firestore schema, Room schema, data flow |
| [`docs/medguard-threat-model.md`](docs/medguard-threat-model.md) | STRIDE threat analysis (10 threats) |
| [`docs/medguard-testing-strategy.md`](docs/medguard-testing-strategy.md) | Testing layers, coverage targets, E2E journeys |
| [`docs/medguard-implementation-plan.md`](docs/medguard-implementation-plan.md) | Phased build plan (10 phases, 45 modules) |

## Citations

The PHI de-identification pipeline in MedGuard was informed by the following:

- **[PHI Deidentification Platform](https://github.com/pitt-cic/phi-deidentification)** (University of Pittsburgh Health Sciences and Sports Analytics Cloud Innovation Center, MIT License) — An AI-driven system for detecting and redacting PHI in clinical text using Claude via Amazon Bedrock. MedGuard's two-stage pipeline (LLM entity extraction + deterministic replacement) draws from this project's approach of using structured LLM output for entity detection with human-in-the-loop validation. The Bedrock integration patterns and HIPAA identifier category coverage were direct references during design.

- **[Claude](https://www.anthropic.com/claude)** (Anthropic) — MedGuard uses Claude in two ways. As the AI model behind the PHI de-identification pipeline (entity extraction via structured output) and the plain-language record summary feature, both accessed through Amazon Bedrock. As a development assistant via [Claude](https://claude.ai/) for brainstorming, debugging and testing the full codebase across all three platforms.

- **[HIPAA Safe Harbor De-identification Standard](https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html)** (45 CFR §164.514(b)) — The 18 identifier categories that MedGuard's PHI pipeline targets (patient name, DOB, SSN, phone, email, MRN, physician name, license number, organization, dates, etc.) are derived from the Safe Harbor method defined by HHS.

- **[Firebase Security Rules documentation](https://firebase.google.com/docs/firestore/security/get-started)** — Firestore security rules patterns for per-user document scoping, map-based access grants, and Cloud Functions-only write enforcement.

- **[Google Tink](https://github.com/tink-crypto/tink-java)** — Cryptographic library used for Android local encryption (AES-256-GCM via Android Keystore).

- **[Envelope Encryption (AWS Well-Architected)](https://docs.aws.amazon.com/wellarchitected/latest/financial-services-industry-lens/use-envelope-encryption-with-customer-managed-keys.html)** — The per-record data key wrapped by a per-user KEK pattern follows the envelope encryption model recommended for sensitive data at rest.