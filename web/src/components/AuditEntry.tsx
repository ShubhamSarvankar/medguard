import type { AuditEntry, AuditActionType } from "@medguard/types";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<AuditActionType, string> = {
  "record.create": "Record created",
  "record.read": "Record viewed",
  "record.update": "Record updated",
  "record.delete": "Record deleted",
  "record.pendingApproval": "Pending approval",
  "record.approved": "Record approved",
  "record.rejected": "Record rejected",
  "annotation.create": "Annotation added",
  "annotation.update": "Annotation updated",
  "annotation.delete": "Annotation deleted",
  "share.initiate": "Share initiated",
  "share.accept": "Share accepted",
  "share.revoke": "Share revoked",
  "share.expire": "Share expired",
  "ai.deidentify": "PHI de-identification",
  "ai.summarize": "AI summary",
  "auth.login": "Login",
  "auth.logout": "Logout",
  "careCircle.invite": "Care circle invite",
  "careCircle.accept": "Care circle accepted",
  "careCircle.remove": "Care circle removed",
  "user.deleteRequest": "Account deletion requested",
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function actionVariant(actionType: AuditActionType): BadgeVariant {
  if (actionType.startsWith("share.")) return "secondary";
  if (actionType.startsWith("ai.")) return "outline";
  if (
    actionType === "record.delete" ||
    actionType === "record.rejected" ||
    actionType === "share.revoke" ||
    actionType === "user.deleteRequest"
  )
    return "destructive";
  return "default";
}

function formatTimestamp(ts: unknown): string {
  const seconds = (ts as { seconds: number } | null)?.seconds;
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40 transition-colors">
      <td className="py-2 pr-4 text-sm text-muted-foreground whitespace-nowrap">
        {formatTimestamp(entry.timestamp)}
      </td>
      <td className="py-2 pr-4">
        <Badge variant={actionVariant(entry.actionType)} className="font-normal">
          {ACTION_LABELS[entry.actionType] ?? entry.actionType}
        </Badge>
      </td>
      <td className="py-2 pr-4 text-sm font-mono text-muted-foreground truncate max-w-[160px]">
        {entry.recordId ?? "—"}
      </td>
      <td className="py-2 text-sm font-mono text-muted-foreground truncate max-w-[160px]">
        {entry.actorUid}
      </td>
    </tr>
  );
}

export { ACTION_LABELS };
