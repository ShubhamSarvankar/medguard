import type { Timestamp } from "firebase-admin/firestore";

export type PhiPlaceholder =
  | "[PATIENT_NAME]"
  | "[DATE_OF_BIRTH]"
  | "[SSN]"
  | "[PHONE_NUMBER]"
  | "[EMAIL_ADDRESS]"
  | "[MEDICAL_RECORD_NUMBER]"
  | "[PHYSICIAN_NAME]"
  | "[LICENSE_NUMBER]"
  | "[ORGANIZATION]"
  | "[DATE]";

export type RecordStatus = "active" | "pending_approval" | "rejected";

export interface Vitals {
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRateBpm?: number;
  weightKg?: number;
  temperatureCelsius?: number;
  recordedAt: Timestamp;
}

export interface Medication {
  name: string;
  doseAmount: string;
  doseUnit: string;
  frequency: string;
  startDate?: Timestamp;
  endDate?: Timestamp;
}

export interface Diagnosis {
  code: string;
  description: string;
  diagnosedAt: Timestamp;
}

export interface RecordAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  storagePath: string;
  sizeBytes: number;
  uploadedAt: Timestamp;
}

export interface MedicalRecord {
  recordId: string;
  ownerUid: string;
  createdByUid: string;
  status: RecordStatus;
  title: string;
  notes: string;
  vitals?: Vitals;
  medications: Medication[];
  diagnoses: Diagnosis[];
  attachments: RecordAttachment[];
  isDeidentified: boolean;
  // AES-256-KW wrapped data key (owner KEK via Cloud KMS); required by acceptShare to re-encrypt for recipient.
  wrappedDataKey?: string;
  // AES-256-GCM blob of de-identified fields; format: base64(iv[12] + ciphertext + authTag[16]). Plaintext fields absent from Firestore once set.
  encryptedFields?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  visitDate: Timestamp;
}

export interface DeletionRequest {
  deletionRequestId: string;
  uid: string;
  requestedAt: Timestamp;
  scheduledFor: Timestamp;
  processed: boolean;
  processedAt?: Timestamp;
}