import { useState } from "react";
import { UserIcon, UsersIcon, Trash2Icon, PlusIcon, CheckIcon, XIcon } from "lucide-react";
import { useCurrentUser } from "@/features/auth/useAuth";
import {
  useUserProfile,
  useCareCircle,
  usePendingInvites,
  useInviteToCareCircle,
  useAcceptCareCircleInvite,
  useRemoveCareCircleMember,
  useDeleteUserData,
} from "./useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const DELETE_CONFIRM_PHRASE = "DELETE MY DATA";

export default function ProfilePage() {
  const user = useCurrentUser();
  const uid = user?.uid;

  const { data: profile } = useUserProfile(uid);
  const { data: careCircle = [] } = useCareCircle(uid);
  const { data: pendingInvites = [] } = usePendingInvites(uid);

  const inviteMutation = useInviteToCareCircle(uid ?? "");
  const acceptMutation = useAcceptCareCircleInvite(uid ?? "");
  const removeMutation = useRemoveCareCircleMember(uid ?? "");
  const deleteMutation = useDeleteUserData();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"caretaker" | "clinician">("caretaker");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteDone, setDeleteDone] = useState(false);

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate(
      { inviteeEmail: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: () => setInviteEmail(""),
      }
    );
  }

  function handleDelete() {
    if (!uid) return;
    setDeleteError("");
    deleteMutation.mutate(
      { uid, confirmPhrase: deleteConfirm },
      {
        onSuccess: () => setDeleteDone(true),
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to submit deletion request.";
          setDeleteError(msg);
        },
      }
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-10">

      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserIcon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Profile</h1>
        </div>
        <div className="rounded-lg border p-4 space-y-1 text-sm">
          <p><span className="text-muted-foreground">Name:</span> {profile?.displayName ?? "—"}</p>
          <p><span className="text-muted-foreground">Email:</span> {profile?.email ?? "—"}</p>
          <p>
            <span className="text-muted-foreground">Role:</span>{" "}
            <Badge variant="outline">{profile?.role ?? "—"}</Badge>
          </p>
        </div>
      </section>

      {pendingInvites.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Pending invitations</h2>
          <ul className="space-y-2">
            {pendingInvites.map((inv) => (
              <li key={inv.inviteId} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="text-sm">
                  <p className="font-medium">Care circle invite</p>
                  <p className="text-muted-foreground">Role: {inv.role}</p>
                </div>
                <Button
                  size="sm"
                  disabled={acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate(inv.inviteId)}
                >
                  <CheckIcon className="mr-1 h-4 w-4" />
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile?.role === "patient" && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UsersIcon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">Care circle</h2>
          </div>

          {careCircle.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">No members yet.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {careCircle.map((m) => (
                <li key={m.uid} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="text-sm">
                    <p className="font-medium">{m.displayName}</p>
                    <p className="text-muted-foreground">{m.role}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(m.uid)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Invite a member</p>
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "caretaker" | "clinician")}
                className="rounded-md border bg-background px-2 text-sm"
              >
                <option value="caretaker">Caretaker</option>
                <option value="clinician">Clinician</option>
              </select>
              <Button size="sm" disabled={inviteMutation.isPending} onClick={handleInvite}>
                <PlusIcon className="mr-1 h-4 w-4" />
                Invite
              </Button>
            </div>
            {inviteMutation.isError && (
              <p className="text-sm text-destructive">
                {inviteMutation.error instanceof Error
                  ? inviteMutation.error.message
                  : "Failed to send invite."}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="border-t pt-8">
        <div className="flex items-center gap-2 mb-3">
          <Trash2Icon className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-medium text-destructive">Delete account</h2>
        </div>
        {deleteDone ? (
          <p className="text-sm text-muted-foreground">
            Your deletion request has been submitted. Your account will be deleted in 30 days.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all your records and data after a 30-day waiting period.
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm.
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
            />
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirm !== DELETE_CONFIRM_PHRASE || deleteMutation.isPending}
              onClick={handleDelete}
            >
              Submit deletion request
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
