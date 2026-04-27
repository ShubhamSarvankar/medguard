import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog, fetchAuditLogByRecord } from "@/lib/firestore";
import type { AuditEntry, AuditActionType } from "@medguard/types";

export const auditKeys = {
  byActor: (uid: string) => ["auditLog", "actor", uid] as const,
  byRecord: (recordId: string) => ["auditLog", "record", recordId] as const,
};

export interface AuditFilters {
  actionType?: AuditActionType;
  startDate?: Date;
  endDate?: Date;
}

function applyLocalFilters(entries: AuditEntry[], filters: AuditFilters): AuditEntry[] {
  return entries.filter((e) => {
    if (filters.actionType && e.actionType !== filters.actionType) return false;
    const ts = (e.timestamp as unknown as { seconds: number } | null)?.seconds;
    if (ts !== undefined) {
      if (filters.startDate && ts * 1000 < filters.startDate.getTime()) return false;
      if (filters.endDate && ts * 1000 > filters.endDate.getTime()) return false;
    }
    return true;
  });
}

export function useAuditLog(
  uid: string | null | undefined,
  filters: AuditFilters = {}
) {
  return useQuery({
    queryKey: [...auditKeys.byActor(uid ?? ""), filters],
    queryFn: async (): Promise<AuditEntry[]> => {
      const entries = await fetchAuditLog(uid!);
      return applyLocalFilters(entries, filters);
    },
    enabled: !!uid,
    staleTime: 1000 * 30,
  });
}

export function useAuditLogByRecord(
  recordId: string | null | undefined,
  filters: AuditFilters = {}
) {
  return useQuery({
    queryKey: [...auditKeys.byRecord(recordId ?? ""), filters],
    queryFn: async (): Promise<AuditEntry[]> => {
      const entries = await fetchAuditLogByRecord(recordId!);
      return applyLocalFilters(entries, filters);
    },
    enabled: !!recordId,
    staleTime: 1000 * 30,
  });
}

export function exportAuditLogCSV(entries: AuditEntry[]): string {
  const HEADERS = ["Date", "Action", "Record ID", "Actor UID", "Share ID"];
  const rows = entries.map((e) => {
    const ts = (e.timestamp as unknown as { seconds: number } | null)?.seconds;
    const date = ts ? new Date(ts * 1000).toISOString() : "";
    return [date, e.actionType, e.recordId ?? "", e.actorUid, e.shareId ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [HEADERS.join(","), ...rows].join("\n");
}

export function downloadAuditCSV(entries: AuditEntry[], filename = "audit-log.csv"): void {
  const csv = exportAuditLogCSV(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
