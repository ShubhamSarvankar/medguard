import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PencilIcon, Trash2Icon, ArrowLeftIcon, ShareIcon, XIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { callSummarizeRecord, type SummarizeRecordResponse } from "@/lib/functions";
import { useRecord, useDeleteRecord } from "./useRecords";
import { useAnnotations, useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation } from "./useAnnotations";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useActiveShares, useInitiateShare, useRevokeShare } from "@/features/share/useShare";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ShareGrant, RecordAnnotation } from "@medguard/types";

function formatTs(ts: unknown): string {
  const seconds = (ts as { seconds: number } | null)?.seconds;
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function RecordDetail() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const { data: record, isLoading, isError } = useRecord(recordId);
  const deleteMutation = useDeleteRecord(user?.uid ?? "");
  const isOwner = record?.ownerUid === user?.uid;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="text-sm text-destructive">Record not found.</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/records">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold leading-tight">{record.title}</h1>
        {isOwner && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/records/${recordId}/edit`}>
                <PencilIcon className="mr-1 h-3 w-3" />
                Edit
              </Link>
            </Button>
            <DeleteRecordButton
              onConfirm={() => {
                deleteMutation.mutate(record.recordId, {
                  onSuccess: () => navigate("/records", { replace: true }),
                });
              }}
              isPending={deleteMutation.isPending}
            />
          </div>
        )}
      </div>

      <div className="space-y-6 text-sm">
        <DetailRow label="Visit date" value={formatTs(record.visitDate)} />

        {record.notes && (
          <DetailSection title="Notes">
            <p className="whitespace-pre-wrap text-muted-foreground">{record.notes}</p>
          </DetailSection>
        )}

        {record.vitals && (
          <DetailSection title="Vitals">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
              {record.vitals.bloodPressureSystolic !== undefined &&
                record.vitals.bloodPressureDiastolic !== undefined && (
                  <VitalRow
                    label="Blood pressure"
                    value={`${record.vitals.bloodPressureSystolic}/${record.vitals.bloodPressureDiastolic} mmHg`}
                  />
                )}
              {record.vitals.heartRateBpm !== undefined && (
                <VitalRow label="Heart rate" value={`${record.vitals.heartRateBpm} bpm`} />
              )}
              {record.vitals.weightKg !== undefined && (
                <VitalRow label="Weight" value={`${record.vitals.weightKg} kg`} />
              )}
              {record.vitals.temperatureCelsius !== undefined && (
                <VitalRow label="Temperature" value={`${record.vitals.temperatureCelsius} \u00b0C`} />
              )}
            </dl>
          </DetailSection>
        )}

        {record.medications.length > 0 && (
          <DetailSection title="Medications">
            <ul className="space-y-2">
              {record.medications.map((med, i) => (
                <li key={i}>
                  <span className="font-medium">{med.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {med.doseAmount} {med.doseUnit} — {med.frequency}
                  </span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {record.diagnoses.length > 0 && (
          <DetailSection title="Diagnoses">
            <ul className="space-y-2">
              {record.diagnoses.map((diag, i) => (
                <li key={i}>
                  <Badge variant="secondary" className="mr-2 font-mono">
                    {diag.code}
                  </Badge>
                  <span className="text-muted-foreground">{diag.description}</span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {record.attachments.length > 0 && (
          <DetailSection title={`Attachments (${record.attachments.length})`}>
            <ul className="space-y-1">
              {record.attachments.map((att) => (
                <li key={att.attachmentId} className="text-muted-foreground">
                  {att.fileName}
                  <span className="ml-2 text-xs">
                    ({(att.sizeBytes / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {recordId && (
          <SummarizeSection recordId={recordId} />
        )}

        {isOwner && recordId && (
          <SharePanel recordId={recordId} />
        )}

        {recordId && (
          <AnnotationsSection recordId={recordId} currentUid={user?.uid} />
        )}
      </div>
    </div>
  );
}

function AnnotationsSection({
  recordId,
  currentUid,
}: {
  recordId: string;
  currentUid: string | undefined;
}) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: annotations = [], isLoading } = useAnnotations(recordId);
  const createMutation = useCreateAnnotation(recordId);
  const updateMutation = useUpdateAnnotation(recordId);
  const deleteMutation = useDeleteAnnotation(recordId);

  function handleCreate() {
    if (!newText.trim()) return;
    createMutation.mutate(newText.trim(), {
      onSuccess: () => setNewText(""),
    });
  }

  function startEdit(annotation: RecordAnnotation) {
    setEditingId(annotation.annotationId);
    setEditText(annotation.text);
  }

  function handleUpdate() {
    if (!editingId || !editText.trim()) return;
    updateMutation.mutate(
      { annotationId: editingId, text: editText.trim() },
      { onSuccess: () => setEditingId(null) }
    );
  }

  if (isLoading) return null;

  return (
    <DetailSection title="Clinician Annotations">
      <div className="space-y-3">
        {annotations.map((ann) =>
          editingId === ann.annotationId ? (
            <div key={ann.annotationId} className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={ann.annotationId}
              className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {ann.authorDisplayName}
                  </p>
                  <p className="whitespace-pre-wrap">{ann.text}</p>
                </div>
                {ann.authorUid === currentUid && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => startEdit(ann)}
                    >
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => deleteMutation.mutate(ann.annotationId)}
                      disabled={deleteMutation.isPending}
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        <div className="space-y-2">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add a clinical annotation…"
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreate}
            disabled={!newText.trim() || createMutation.isPending}
          >
            <PlusIcon className="h-3 w-3 mr-1" />
            Add annotation
          </Button>
        </div>
      </div>
    </DetailSection>
  );
}

function SummarizeSection({ recordId }: { recordId: string }) {
  const [result, setResult] = useState<SummarizeRecordResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSummarize() {
    setLoading(true);
    setError(null);
    try {
      const data = await callSummarizeRecord({ recordId });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DetailSection title="AI Summary">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-medium">AI-generated · </span>
              {result.disclaimer}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setResult(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSummarize}
            disabled={loading}
          >
            <SparklesIcon className="mr-1.5 h-3.5 w-3.5" />
            {loading ? "Generating…" : "Summarize"}
          </Button>
        </div>
      )}
    </DetailSection>
  );
}

function SharePanel({ recordId }: { recordId: string }) {
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<"1h" | "24h" | "7d" | "permanent">("permanent");

  const { data: activeShares = [], isLoading } = useActiveShares(recordId);
  const initiateMutation = useInitiateShare();
  const revokeMutation = useRevokeShare(recordId);

  function handleGenerateCode() {
    initiateMutation.mutate(
      { recordId, method: "code", expiry },
      {
        onSuccess: (data) => {
          if (data.code) setGeneratedCode(data.code.toUpperCase());
          setShowCodeForm(false);
        },
      }
    );
  }

  return (
    <DetailSection title="Sharing">
      <div className="space-y-4">
        {generatedCode && (
          <div className="rounded-md border bg-muted/40 p-4">
            <p className="mb-1 text-xs text-muted-foreground">Share code (10 min)</p>
            <p className="font-mono text-2xl font-semibold tracking-widest text-primary">
              {generatedCode}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs"
              onClick={() => setGeneratedCode(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {showCodeForm ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Expiry</label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as typeof expiry)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleGenerateCode}
              disabled={initiateMutation.isPending}
            >
              {initiateMutation.isPending ? "Generating..." : "Generate"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCodeForm(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCodeForm(true)}
          >
            <ShareIcon className="mr-1.5 h-3.5 w-3.5" />
            Generate share code
          </Button>
        )}

        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading active shares...</p>
        )}

        {activeShares.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active shares
            </p>
            <ul className="space-y-2">
              {activeShares.map((share: ShareGrant) => (
                <ActiveShareRow
                  key={share.shareId}
                  share={share}
                  onRevoke={() => revokeMutation.mutate(share.shareId)}
                  isRevoking={
                    revokeMutation.isPending &&
                    revokeMutation.variables === share.shareId
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

function ActiveShareRow({
  share,
  onRevoke,
  isRevoking,
}: {
  share: ShareGrant;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const acceptedAt = share.acceptedAt
    ? new Date(
        (share.acceptedAt as unknown as { seconds: number }).seconds * 1000
      ).toLocaleDateString()
    : "Pending";

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <p className="text-xs font-medium">{share.recipientUid || "Code share"}</p>
        <p className="text-xs text-muted-foreground">
          {share.method === "tap" ? "Tap share" : "Code share"} &middot; Accepted {acceptedAt}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            disabled={isRevoking}
          >
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately remove this recipient's access to the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function VitalRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DeleteRecordButton({
  onConfirm,
  isPending,
}: {
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={isPending}>
          <Trash2Icon className="mr-1 h-3 w-3" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the record and all its attachments. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}