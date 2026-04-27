import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MedicalRecord, Medication, Vitals } from "@medguard/types";
import {
  fetchRecords,
  fetchRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/firestore";
import { callCreateRecord } from "@/lib/functions";
import { useCurrentUser } from "@/features/auth/useAuth";
import type { RecordFormValues } from "./recordSchemas";

export const recordKeys = {
  all: (uid: string) => ["records", uid] as const,
  detail: (recordId: string) => ["records", "detail", recordId] as const,
};

export function useRecords(uid: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.all(uid ?? ""),
    queryFn: () => fetchRecords(uid!),
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
  });
}

export function useRecord(recordId: string | null | undefined) {
  return useQuery({
    queryKey: recordKeys.detail(recordId ?? ""),
    queryFn: () => fetchRecord(recordId!),
    enabled: !!recordId,
    staleTime: 1000 * 60 * 2,
  });
}

function formValuesToRecord(
  values: RecordFormValues,
  ownerUid: string,
  recordId: string
): Omit<MedicalRecord, "createdAt" | "updatedAt"> {
  const now = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as const;
  const visitTs = {
    seconds: Math.floor(new Date(values.visitDate).getTime() / 1000),
    nanoseconds: 0,
  } as const;

  let vitals: Vitals | undefined;
  if (values.vitals) {
    vitals = {
      recordedAt: now as unknown as import("@firebase/firestore").Timestamp,
      ...(values.vitals.bloodPressureSystolic !== undefined && {
        bloodPressureSystolic: values.vitals.bloodPressureSystolic,
      }),
      ...(values.vitals.bloodPressureDiastolic !== undefined && {
        bloodPressureDiastolic: values.vitals.bloodPressureDiastolic,
      }),
      ...(values.vitals.heartRateBpm !== undefined && {
        heartRateBpm: values.vitals.heartRateBpm,
      }),
      ...(values.vitals.weightKg !== undefined && {
        weightKg: values.vitals.weightKg,
      }),
      ...(values.vitals.temperatureCelsius !== undefined && {
        temperatureCelsius: values.vitals.temperatureCelsius,
      }),
    };
  }

  const medications: Medication[] = (values.medications ?? []).map((m) => ({
    name: m.name,
    doseAmount: m.doseAmount,
    doseUnit: m.doseUnit,
    frequency: m.frequency,
    ...(m.startDate
      ? {
          startDate: {
            seconds: Math.floor(new Date(m.startDate).getTime() / 1000),
            nanoseconds: 0,
          } as unknown as import("@firebase/firestore").Timestamp,
        }
      : {}),
    ...(m.endDate
      ? {
          endDate: {
            seconds: Math.floor(new Date(m.endDate).getTime() / 1000),
            nanoseconds: 0,
          } as unknown as import("@firebase/firestore").Timestamp,
        }
      : {}),
  }));

  return {
    recordId,
    ownerUid,
    createdByUid: ownerUid,
    status: "active",
    title: values.title,
    notes: values.notes ?? "",
    isDeidentified: true,
    visitDate: visitTs as unknown as import("@firebase/firestore").Timestamp,
    ...(vitals !== undefined && { vitals }),
    medications,
    diagnoses: (values.diagnoses ?? []).map((d) => ({
      code: d.code,
      description: d.description,
      diagnosedAt: {
        seconds: Math.floor(new Date(d.diagnosedAt).getTime() / 1000),
        nanoseconds: 0,
      } as unknown as import("@firebase/firestore").Timestamp,
    })),
    attachments: (values.attachments ?? []).map((a) => ({
      attachmentId: a.attachmentId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      storagePath: a.storagePath ?? "",
      sizeBytes: a.sizeBytes,
      uploadedAt: now as unknown as import("@firebase/firestore").Timestamp,
    })),
  };
}

export function useCreateRecord(ownerUid: string) {
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  return useMutation({
    mutationFn: async (values: RecordFormValues) => {
      const recordId = crypto.randomUUID();
      const visitDate = Math.floor(new Date(values.visitDate).getTime() / 1000);

      const vitals = values.vitals;
      const hasVitals =
        vitals &&
        (vitals.bloodPressureSystolic !== undefined ||
          vitals.bloodPressureDiastolic !== undefined ||
          vitals.heartRateBpm !== undefined ||
          vitals.weightKg !== undefined ||
          vitals.temperatureCelsius !== undefined);

      await callCreateRecord({
        recordId,
        title: values.title,
        notes: values.notes ?? "",
        visitDate,
        ...(hasVitals && {
          vitals: {
            ...(vitals!.bloodPressureSystolic !== undefined && {
              bloodPressureSystolic: vitals!.bloodPressureSystolic,
            }),
            ...(vitals!.bloodPressureDiastolic !== undefined && {
              bloodPressureDiastolic: vitals!.bloodPressureDiastolic,
            }),
            ...(vitals!.heartRateBpm !== undefined && {
              heartRateBpm: vitals!.heartRateBpm,
            }),
            ...(vitals!.weightKg !== undefined && { weightKg: vitals!.weightKg }),
            ...(vitals!.temperatureCelsius !== undefined && {
              temperatureCelsius: vitals!.temperatureCelsius,
            }),
          },
        }),
        medications: (values.medications ?? []).map((m) => ({
          name: m.name,
          doseAmount: m.doseAmount,
          doseUnit: m.doseUnit,
          frequency: m.frequency,
        })),
        diagnoses: (values.diagnoses ?? []).map((d) => ({
          code: d.code,
          description: d.description,
          diagnosedAt: Math.floor(new Date(d.diagnosedAt).getTime() / 1000),
        })),
      });
      return recordId;
    },
    onSuccess: () => {
      const uid = user?.uid ?? ownerUid;
      queryClient.resetQueries({ queryKey: recordKeys.all(uid) });
    },
  });
}

export function useUpdateRecord(ownerUid: string, recordId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RecordFormValues) => {
      const partial = formValuesToRecord(values, ownerUid, recordId);
      await updateRecord(recordId, partial);
    },
    onSuccess: () => {
      queryClient.resetQueries({ queryKey: recordKeys.all(ownerUid) });
      queryClient.resetQueries({ queryKey: recordKeys.detail(recordId) });
    },
  });
}

export function useDeleteRecord(ownerUid: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordId: string) => deleteRecord(recordId),
    onSuccess: () => {
      queryClient.resetQueries({ queryKey: recordKeys.all(ownerUid) });
    },
  });
}