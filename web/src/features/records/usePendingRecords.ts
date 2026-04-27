import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchPendingRecords } from "@/lib/firestore";
import { callApproveRecord, callRejectRecord } from "@/lib/functions";
import type { MedicalRecord } from "@medguard/types";

export function usePendingRecords(uid: string | undefined) {
  return useQuery<MedicalRecord[]>({
    queryKey: ["pendingRecords", uid],
    queryFn: () => fetchPendingRecords(uid!),
    enabled: !!uid,
  });
}

export function useApproveRecord(uid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => callApproveRecord({ recordId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingRecords", uid] });
      queryClient.invalidateQueries({ queryKey: ["records", uid] });
    },
  });
}

export function useRejectRecord(uid: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => callRejectRecord({ recordId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingRecords", uid] });
    },
  });
}
