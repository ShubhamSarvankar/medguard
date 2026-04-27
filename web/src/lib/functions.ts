import { httpsCallable } from "firebase/functions";
import { fns } from "./firebase";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface CreateRecordRequest {
  recordId: string;
  title: string;
  notes: string;
  visitDate: number;
  vitals?: {
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRateBpm?: number;
    weightKg?: number;
    temperatureCelsius?: number;
  };
  medications: Array<{
    name: string;
    doseAmount: string;
    doseUnit: string;
    frequency: string;
  }>;
  diagnoses: Array<{
    code: string;
    description: string;
    diagnosedAt: number;
  }>;
}

export interface CreateRecordResponse {
  recordId: string;
}

export async function callCreateRecord(
  request: CreateRecordRequest,
): Promise<CreateRecordResponse> {
  const fn = httpsCallable<CreateRecordRequest, CreateRecordResponse>(
    fns,
    "createRecord",
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

export interface SummarizeRecordRequest {
  recordId: string;
}

export interface SummarizeRecordResponse {
  summary: string;
  modelId: string;
  generatedAt: string;
  disclaimer: string;
}

export async function callSummarizeRecord(
  request: SummarizeRecordRequest
): Promise<SummarizeRecordResponse> {
  const fn = httpsCallable<SummarizeRecordRequest, SummarizeRecordResponse>(
    fns,
    "summarizeRecord"
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

export interface InitiateShareRequest {
  recordId: string;
  method: "tap" | "code";
  recipientUid?: string;
  expiry: "1h" | "24h" | "7d" | "permanent";
}

export interface InitiateShareResponse {
  shareId: string;
  code?: string;
  expiresAt?: string;
}

export interface AcceptShareRequest {
  shareId?: string;
  code?: string;
}

export interface AcceptShareResponse {
  shareId: string;
  recordId: string;
  senderUid: string;
  encryptedPayload: string;
}

export interface RevokeShareRequest {
  shareId: string;
}

export interface RevokeShareResponse {
  shareId: string;
  revokedAt: string;
}

export async function callInitiateShare(
  request: InitiateShareRequest
): Promise<InitiateShareResponse> {
  const fn = httpsCallable<InitiateShareRequest, InitiateShareResponse>(
    fns,
    "initiateShare"
  );
  const result = await fn(request);
  return result.data;
}

export async function callAcceptShare(
  request: AcceptShareRequest
): Promise<AcceptShareResponse> {
  const fn = httpsCallable<AcceptShareRequest, AcceptShareResponse>(
    fns,
    "acceptShare"
  );
  const result = await fn(request);
  return result.data;
}

export async function callRevokeShare(
  request: RevokeShareRequest
): Promise<RevokeShareResponse> {
  const fn = httpsCallable<RevokeShareRequest, RevokeShareResponse>(
    fns,
    "revokeShare"
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Approval flow
// ---------------------------------------------------------------------------

export interface SubmitRecordForApprovalRequest {
  patientUid: string;
  title: string;
  notes?: string;
  visitDate: number;
  medications?: { name: string; doseAmount: string; doseUnit: string; frequency: string }[];
  diagnoses?: { code: string; description: string }[];
}

export interface SubmitRecordForApprovalResponse {
  recordId: string;
}

export interface ApproveRejectRecordRequest {
  recordId: string;
}

export interface ApproveRejectRecordResponse {
  recordId: string;
}

export async function callSubmitRecordForApproval(
  request: SubmitRecordForApprovalRequest
): Promise<SubmitRecordForApprovalResponse> {
  const fn = httpsCallable<SubmitRecordForApprovalRequest, SubmitRecordForApprovalResponse>(
    fns,
    "submitRecordForApproval"
  );
  const result = await fn(request);
  return result.data;
}

export async function callApproveRecord(
  request: ApproveRejectRecordRequest
): Promise<ApproveRejectRecordResponse> {
  const fn = httpsCallable<ApproveRejectRecordRequest, ApproveRejectRecordResponse>(
    fns,
    "approveRecord"
  );
  const result = await fn(request);
  return result.data;
}

export async function callRejectRecord(
  request: ApproveRejectRecordRequest
): Promise<ApproveRejectRecordResponse> {
  const fn = httpsCallable<ApproveRejectRecordRequest, ApproveRejectRecordResponse>(
    fns,
    "rejectRecord"
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export interface CreateAnnotationRequest {
  recordId: string;
  text: string;
}

export interface CreateAnnotationResponse {
  annotationId: string;
}

export interface UpdateAnnotationRequest {
  recordId: string;
  annotationId: string;
  text: string;
}

export interface UpdateAnnotationResponse {
  annotationId: string;
}

export interface DeleteAnnotationRequest {
  recordId: string;
  annotationId: string;
}

export interface DeleteAnnotationResponse {
  annotationId: string;
}

export async function callCreateAnnotation(
  request: CreateAnnotationRequest
): Promise<CreateAnnotationResponse> {
  const fn = httpsCallable<CreateAnnotationRequest, CreateAnnotationResponse>(
    fns,
    "createAnnotation"
  );
  const result = await fn(request);
  return result.data;
}

export async function callUpdateAnnotation(
  request: UpdateAnnotationRequest
): Promise<UpdateAnnotationResponse> {
  const fn = httpsCallable<UpdateAnnotationRequest, UpdateAnnotationResponse>(
    fns,
    "updateAnnotation"
  );
  const result = await fn(request);
  return result.data;
}

export async function callDeleteAnnotation(
  request: DeleteAnnotationRequest
): Promise<DeleteAnnotationResponse> {
  const fn = httpsCallable<DeleteAnnotationRequest, DeleteAnnotationResponse>(
    fns,
    "deleteAnnotation"
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Care circle
// ---------------------------------------------------------------------------

export interface InviteToCareCircleRequest {
  inviteeEmail: string;
  role: "caretaker" | "clinician";
}

export interface InviteToCareCircleResponse {
  inviteId: string;
}

export interface AcceptCareCircleInviteRequest {
  inviteId: string;
}

export interface AcceptCareCircleInviteResponse {
  inviteId: string;
  patientUid: string;
}

export interface RemoveCareCircleMemberRequest {
  memberUid: string;
}

export interface RemoveCareCircleMemberResponse {
  memberUid: string;
}

export async function callInviteToCareCircle(
  request: InviteToCareCircleRequest
): Promise<InviteToCareCircleResponse> {
  const fn = httpsCallable<InviteToCareCircleRequest, InviteToCareCircleResponse>(
    fns,
    "inviteToCareCircle"
  );
  const result = await fn(request);
  return result.data;
}

export async function callAcceptCareCircleInvite(
  request: AcceptCareCircleInviteRequest
): Promise<AcceptCareCircleInviteResponse> {
  const fn = httpsCallable<AcceptCareCircleInviteRequest, AcceptCareCircleInviteResponse>(
    fns,
    "acceptCareCircleInvite"
  );
  const result = await fn(request);
  return result.data;
}

export async function callRemoveCareCircleMember(
  request: RemoveCareCircleMemberRequest
): Promise<RemoveCareCircleMemberResponse> {
  const fn = httpsCallable<RemoveCareCircleMemberRequest, RemoveCareCircleMemberResponse>(
    fns,
    "removeCareCircleMember"
  );
  const result = await fn(request);
  return result.data;
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export interface DeleteUserDataRequest {
  uid: string;
  confirmPhrase: string;
}

export interface DeleteUserDataResponse {
  deletionRequestId: string;
  scheduledFor: string;
}

export async function callDeleteUserData(
  request: DeleteUserDataRequest
): Promise<DeleteUserDataResponse> {
  const fn = httpsCallable<DeleteUserDataRequest, DeleteUserDataResponse>(
    fns,
    "deleteUserData"
  );
  const result = await fn(request);
  return result.data;
}