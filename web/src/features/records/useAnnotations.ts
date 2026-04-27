import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAnnotations } from "@/lib/firestore";
import {
  callCreateAnnotation,
  callUpdateAnnotation,
  callDeleteAnnotation,
} from "@/lib/functions";
import type { RecordAnnotation } from "@medguard/types";

export function useAnnotations(recordId: string | undefined) {
  return useQuery<RecordAnnotation[]>({
    queryKey: ["annotations", recordId],
    queryFn: () => fetchAnnotations(recordId!),
    enabled: !!recordId,
  });
}

export function useCreateAnnotation(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => callCreateAnnotation({ recordId, text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", recordId] });
    },
  });
}

export function useUpdateAnnotation(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ annotationId, text }: { annotationId: string; text: string }) =>
      callUpdateAnnotation({ recordId, annotationId, text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", recordId] });
    },
  });
}

export function useDeleteAnnotation(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotationId: string) => callDeleteAnnotation({ recordId, annotationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", recordId] });
    },
  });
}
