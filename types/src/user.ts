import type { Timestamp } from "firebase-admin/firestore";

export type UserRole = "patient" | "caretaker" | "clinician";

export interface User {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CareCircleMember {
  uid: string;
  displayName: string;
  role: Exclude<UserRole, "patient">;
  grantedAt: Timestamp;
  grantedBy: string;
}

export type CareCircleStatus = "pending" | "accepted";

export interface CareCircleInvite {
  inviteId: string;
  patientUid: string;
  inviteeEmail: string;
  inviteeUid?: string;
  role: Exclude<UserRole, "patient">;
  status: CareCircleStatus;
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
}