import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  callInitiateShare,
  callAcceptShare,
  callRevokeShare,
  type InitiateShareRequest,
  type AcceptShareRequest,
} from "@/lib/functions";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { ShareGrant } from "@medguard/types";
import { useCurrentUser } from "@/features/auth/useAuth";

function toShareGrant(doc: QueryDocumentSnapshot): ShareGrant {
  return doc.data() as ShareGrant;
}

export function useActiveShares(recordId: string) {
  const user = useCurrentUser();

  return useQuery({
    queryKey: ["shares", recordId],
    queryFn: async () => {
      const q = query(
        collection(db, "shares"),
        where("recordId", "==", recordId),
        where("senderUid", "==", user?.uid ?? ""),
        where("status", "==", "accepted")
      );
      const snap = await getDocs(q);
      return snap.docs.map(toShareGrant);
    },
    enabled: !!user?.uid && !!recordId,
  });
}

export function useInitiateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: InitiateShareRequest) => callInitiateShare(request),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["shares", variables.recordId] });
    },
  });
}

export function useAcceptShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AcceptShareRequest) => callAcceptShare(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["records"] });
    },
  });
}

export function useRevokeShare(recordId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) => callRevokeShare({ shareId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", recordId] });
    },
  });
}