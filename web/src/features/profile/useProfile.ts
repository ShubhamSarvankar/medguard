import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUserProfile, fetchCareCircle, fetchPendingInvites } from "@/lib/firestore";
import {
  callInviteToCareCircle,
  callAcceptCareCircleInvite,
  callRemoveCareCircleMember,
  callDeleteUserData,
  type InviteToCareCircleRequest,
} from "@/lib/functions";

export function useUserProfile(uid: string | undefined) {
  return useQuery({
    queryKey: ["profile", uid],
    queryFn: () => fetchUserProfile(uid!),
    enabled: !!uid,
  });
}

export function useCareCircle(uid: string | undefined) {
  return useQuery({
    queryKey: ["careCircle", uid],
    queryFn: () => fetchCareCircle(uid!),
    enabled: !!uid,
  });
}

export function usePendingInvites(uid: string | undefined) {
  return useQuery({
    queryKey: ["pendingInvites", uid],
    queryFn: () => fetchPendingInvites(uid!),
    enabled: !!uid,
  });
}

export function useInviteToCareCircle(patientUid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: InviteToCareCircleRequest) => callInviteToCareCircle(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["careCircle", patientUid] });
    },
  });
}

export function useAcceptCareCircleInvite(uid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => callAcceptCareCircleInvite({ inviteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", uid] });
    },
  });
}

export function useRemoveCareCircleMember(patientUid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberUid: string) => callRemoveCareCircleMember({ memberUid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["careCircle", patientUid] });
    },
  });
}

export function useDeleteUserData() {
  return useMutation({
    mutationFn: (params: { uid: string; confirmPhrase: string }) =>
      callDeleteUserData(params),
  });
}
