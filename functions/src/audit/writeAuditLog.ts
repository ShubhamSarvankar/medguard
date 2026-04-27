import * as functions from "firebase-functions";
import { v4 as uuidv4 } from "uuid";
import type { AuditEntry, AuditActionType } from "@medguard/types";
import { writeAuditEntry, serverTimestamp } from "../lib/firestoreAdmin";

export interface WriteAuditLogInput {
  actorUid: string;
  actionType: AuditActionType;
  recordId?: string;
  shareId?: string;
  ipHash?: string;
  aiFunction?: string;
  metadata?: Record<string, string>;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    const entry: AuditEntry = {
      entryId: uuidv4(),
      actorUid: input.actorUid,
      actionType: input.actionType,
      timestamp: serverTimestamp(),
      ...(input.recordId !== undefined && { recordId: input.recordId }),
      ...(input.shareId !== undefined && { shareId: input.shareId }),
      ...(input.ipHash !== undefined && { ipHash: input.ipHash }),
      ...(input.aiFunction !== undefined && { aiFunction: input.aiFunction }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    };

    await writeAuditEntry(entry);
  } catch (err) {
    functions.logger.error("writeAuditLog failed", {
      actionType: input.actionType,
      actorUid: input.actorUid,
      ...(input.recordId !== undefined && { recordId: input.recordId }),
      error: err instanceof Error ? err.constructor.name : "UnknownError",
    });
  }
}