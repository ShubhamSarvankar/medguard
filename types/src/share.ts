import type { Timestamp } from "firebase-admin/firestore";

export type ShareStatus = "pending" | "accepted" | "revoked" | "expired";

export type ShareExpiry = "1h" | "24h" | "7d" | "permanent";

export interface ShareGrant {
  shareId: string;
  recordId: string;
  senderUid: string;
  recipientUid: string;
  method: "tap" | "code";
  status: ShareStatus;
  expiry: ShareExpiry;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
  revokedAt?: Timestamp;
}

export interface ShareCode {
  code: string;
  shareId: string;
  recordId: string;
  senderUid: string;
  expiresAt: Timestamp;
  used: boolean;
}