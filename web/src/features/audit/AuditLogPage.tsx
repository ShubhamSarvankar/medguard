import { useState } from "react";
import { Link } from "react-router-dom";
import { DownloadIcon, ArrowLeftIcon } from "lucide-react";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useAuditLog, downloadAuditCSV, type AuditFilters } from "./useAuditLog";
import { AuditEntryRow } from "@/components/AuditEntry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditActionType } from "@medguard/types";

const PAGE_SIZE = 20;

const ACTION_TYPE_OPTIONS: Array<{ value: AuditActionType | ""; label: string }> = [
  { value: "", label: "All actions" },
  { value: "record.create", label: "Record created" },
  { value: "record.read", label: "Record viewed" },
  { value: "record.update", label: "Record updated" },
  { value: "record.delete", label: "Record deleted" },
  { value: "share.initiate", label: "Share initiated" },
  { value: "share.accept", label: "Share accepted" },
  { value: "share.revoke", label: "Share revoked" },
  { value: "share.expire", label: "Share expired" },
  { value: "ai.deidentify", label: "PHI de-identification" },
  { value: "ai.summarize", label: "AI summary" },
  { value: "annotation.create", label: "Annotation added" },
  { value: "annotation.update", label: "Annotation updated" },
  { value: "annotation.delete", label: "Annotation deleted" },
  { value: "auth.login", label: "Login" },
  { value: "auth.logout", label: "Logout" },
];

export default function AuditLogPage() {
  const user = useCurrentUser();

  const [actionType, setActionType] = useState<AuditActionType | "">("");
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filters: AuditFilters = {
    ...(actionType !== "" && { actionType }),
    ...(startDateStr && { startDate: new Date(startDateStr) }),
    ...(endDateStr && { endDate: new Date(`${endDateStr}T23:59:59`) }),
  };

  const { data: entries = [], isLoading, isError } = useAuditLog(user?.uid, filters);

  const visible = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  function handleExport() {
    if (entries.length === 0) return;
    downloadAuditCSV(entries);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/records">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">Audit Log</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={entries.length === 0}
        >
          <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={actionType}
          onChange={(e) => {
            setActionType(e.target.value as AuditActionType | "");
            setVisibleCount(PAGE_SIZE);
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          aria-label="Filter by action type"
        >
          {ACTION_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <Input
          type="date"
          value={startDateStr}
          onChange={(e) => {
            setStartDateStr(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="w-40 text-sm"
          aria-label="Start date"
        />
        <Input
          type="date"
          value={endDateStr}
          onChange={(e) => {
            setEndDateStr(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          className="w-40 text-sm"
          aria-label="End date"
        />

        {(actionType !== "" || startDateStr || endDateStr) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActionType("");
              setStartDateStr("");
              setEndDateStr("");
              setVisibleCount(PAGE_SIZE);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      )}

      {isError && (
        <p className="text-center text-sm text-destructive">
          Failed to load audit log. Please refresh.
        </p>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">No audit entries found.</p>
      )}

      {!isLoading && !isError && entries.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-2 pr-4 pl-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Action</th>
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
                    Record ID
                  </th>
                  <th className="py-2 pr-3 text-left font-medium text-muted-foreground">
                    Actor UID
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <AuditEntryRow key={entry.entryId} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load more ({entries.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
