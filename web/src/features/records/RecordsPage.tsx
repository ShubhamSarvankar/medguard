import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon, SearchIcon, CheckIcon, XIcon } from "lucide-react";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useRecords } from "./useRecords";
import { usePendingRecords, useApproveRecord, useRejectRecord } from "./usePendingRecords";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordCard } from "@/components/RecordCard";
import type { MedicalRecord } from "@medguard/types";

export default function RecordsPage() {
  const user = useCurrentUser();
  const { data: records, isLoading, isError } = useRecords(user?.uid);
  const { data: pendingRecords = [] } = usePendingRecords(user?.uid);
  const approveMutation = useApproveRecord(user?.uid ?? "");
  const rejectMutation = useRejectRecord(user?.uid ?? "");
  const [search, setSearch] = useState("");

  const filtered = (records ?? []).filter((r) => {
    if (!search.trim()) return true;
    const lower = search.toLowerCase();
    return (
      r.title.toLowerCase().includes(lower) ||
      r.diagnoses.some(
        (d) =>
          d.code.toLowerCase().includes(lower) ||
          d.description.toLowerCase().includes(lower)
      ) ||
      r.medications.some((m) => m.name.toLowerCase().includes(lower))
    );
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Medical Records</h1>
        <Button asChild size="sm">
          <Link to="/records/new/edit">
            <PlusIcon className="mr-1 h-4 w-4" />
            New record
          </Link>
        </Button>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title, diagnosis, or medication"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <span className="text-muted-foreground text-sm">Loading records…</span>
        </div>
      )}

      {isError && (
        <p className="text-center text-sm text-destructive">
          Failed to load records. Please refresh.
        </p>
      )}

      {pendingRecords.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold flex items-center gap-2">
            Pending approval
            <Badge variant="secondary">{pendingRecords.length}</Badge>
          </h2>
          <ul className="space-y-3">
            {pendingRecords.map((record) => (
              <li
                key={record.recordId}
                className="rounded-lg border border-dashed p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{record.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted by caretaker — awaiting your approval
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => approveMutation.mutate(record.recordId)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckIcon className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => rejectMutation.mutate(record.recordId)}
                    disabled={rejectMutation.isPending}
                  >
                    <XIcon className="h-3 w-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {search.trim()
            ? "No records match your search."
            : "No records yet. Create your first one."}
        </p>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((record) => (
            <li key={record.recordId}>
              <RecordCard record={record} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}