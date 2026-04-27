import type { Timestamp } from "firebase-admin/firestore";

export interface RecordAnnotation {
  annotationId: string;
  recordId: string;
  authorUid: string;
  authorDisplayName: string;
  text: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}