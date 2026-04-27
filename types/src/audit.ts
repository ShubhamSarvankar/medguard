import type { Timestamp } from "firebase-admin/firestore";

export type AuditActionType =
  | "record.create"
  | "record.read"
  | "record.update"
  | "record.delete"
  | "record.pendingApproval"
  | "record.approved"
  | "record.rejected"
  | "annotation.create"
  | "annotation.update"
  | "annotation.delete"
  | "share.initiate"
  | "share.accept"
  | "share.revoke"
  | "share.expire"
  | "ai.deidentify"
  | "ai.summarize"
  | "auth.login"
  | "auth.logout"
  | "careCircle.invite"
  | "careCircle.accept"
  | "careCircle.remove"
  | "user.deleteRequest";

export interface AuditEntry {
  entryId: string;
  actorUid: string;
  actionType: AuditActionType;
  recordId?: string;
  shareId?: string;
  ipHash?: string;
  aiFunction?: string;
  timestamp: Timestamp;
  metadata?: Record<string, string>;
}