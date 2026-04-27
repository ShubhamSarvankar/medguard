import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useRecord, useCreateRecord, useUpdateRecord } from "./useRecords";
import { recordFormSchema, type RecordFormValues } from "./recordSchemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { MedicalRecord } from "@medguard/types";

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const IS_NEW = "new";

function toDateString(ts: unknown): string {
  const seconds = (ts as { seconds: number } | null)?.seconds;
  if (!seconds) return "";
  return new Date(seconds * 1000).toISOString().split("T")[0] ?? "";
}

function recordToFormValues(record: MedicalRecord): RecordFormValues {
  return {
    title: record.title,
    notes: record.notes,
    visitDate: toDateString(record.visitDate),
    ...(record.vitals
      ? {
          vitals: {
            ...(record.vitals.bloodPressureSystolic !== undefined && {
              bloodPressureSystolic: record.vitals.bloodPressureSystolic,
            }),
            ...(record.vitals.bloodPressureDiastolic !== undefined && {
              bloodPressureDiastolic: record.vitals.bloodPressureDiastolic,
            }),
            ...(record.vitals.heartRateBpm !== undefined && {
              heartRateBpm: record.vitals.heartRateBpm,
            }),
            ...(record.vitals.weightKg !== undefined && {
              weightKg: record.vitals.weightKg,
            }),
            ...(record.vitals.temperatureCelsius !== undefined && {
              temperatureCelsius: record.vitals.temperatureCelsius,
            }),
          },
        }
      : {}),
    medications: record.medications.map((m) => ({
      medicationId: crypto.randomUUID(),
      name: m.name,
      doseAmount: m.doseAmount,
      doseUnit: m.doseUnit,
      frequency: m.frequency,
      ...(m.startDate !== undefined && { startDate: toDateString(m.startDate) }),
      ...(m.endDate !== undefined && { endDate: toDateString(m.endDate) }),
    })),
    diagnoses: record.diagnoses.map((d) => ({
      diagnosisId: crypto.randomUUID(),
      code: d.code,
      description: d.description,
      diagnosedAt: toDateString(d.diagnosedAt),
    })),
    attachments: record.attachments.map((a) => ({
      attachmentId: a.attachmentId,
      fileName: a.fileName,
      mimeType: a.mimeType as (typeof ALLOWED_TYPES)[number],
      sizeBytes: a.sizeBytes,
      storagePath: a.storagePath,
    })),
  };
}

export default function RecordForm() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isNew = recordId === IS_NEW;

  const { data: existingRecord } = useRecord(isNew ? null : recordId);
  const createMutation = useCreateRecord(user?.uid ?? "");
  const updateMutation = useUpdateRecord(user?.uid ?? "", recordId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RecordFormValues>({
    resolver: zodResolver(recordFormSchema),
    defaultValues: {
      title: "",
      notes: "",
      visitDate: new Date().toISOString().split("T")[0] ?? "",
      medications: [],
      diagnoses: [],
      attachments: [],
    },
  });

  useEffect(() => {
    if (existingRecord) reset(recordToFormValues(existingRecord));
  }, [existingRecord, reset]);

  const { fields: medFields, append: appendMed, remove: removeMed } = useFieldArray({
    control,
    name: "medications",
  });

  const { fields: diagFields, append: appendDiag, remove: removeDiag } = useFieldArray({
    control,
    name: "diagnoses",
  });

  const { fields: attFields, append: appendAtt, remove: removeAtt } = useFieldArray({
    control,
    name: "attachments",
  });

  const attachments = watch("attachments");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError("attachments", { message: "Only PDF, JPEG, and PNG files are allowed." });
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError("attachments", { message: "File must be 20 MB or smaller." });
      return;
    }
    if (attachments.length >= 10) {
      setError("attachments", { message: "Maximum 10 attachments per record." });
      return;
    }

    appendAtt({
      attachmentId: crypto.randomUUID(),
      fileName: file.name,
      mimeType: file.type as (typeof ALLOWED_TYPES)[number],
      sizeBytes: file.size,
      storagePath: "",
    });
  }

  async function onSubmit(values: RecordFormValues) {
    try {
      if (isNew) {
        await createMutation.mutateAsync(values);
        navigate("/records");
      } else {
        await updateMutation.mutateAsync(values);
        navigate(`/records/${recordId}`);
      }
    } catch {
      // errors are surfaced via mutation.error — form stays mounted
    }
  }

  const isBusy = isSubmitting || createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">
        {isNew ? "New Record" : "Edit Record"}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Field label="Title *" error={errors.title?.message ?? ""}>
          <Input {...register("title")} placeholder="e.g. Annual physical" />
        </Field>

        <Field label="Visit date *" error={errors.visitDate?.message ?? ""}>
          <Input type="date" {...register("visitDate")} />
        </Field>

        <Field label="Notes" error={errors.notes?.message ?? ""}>
          <Textarea
            {...register("notes")}
            placeholder="Free-text clinical notes"
            rows={4}
          />
        </Field>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Vitals</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Systolic (mmHg)" error={errors.vitals?.bloodPressureSystolic?.message ?? ""}>
              <Input
                type="number"
                {...register("vitals.bloodPressureSystolic", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Diastolic (mmHg)" error={errors.vitals?.bloodPressureDiastolic?.message ?? ""}>
              <Input
                type="number"
                {...register("vitals.bloodPressureDiastolic", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Heart rate (bpm)" error={errors.vitals?.heartRateBpm?.message ?? ""}>
              <Input
                type="number"
                {...register("vitals.heartRateBpm", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Weight (kg)" error={errors.vitals?.weightKg?.message ?? ""}>
              <Input
                type="number"
                step="0.1"
                {...register("vitals.weightKg", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Temperature (°C)" error={errors.vitals?.temperatureCelsius?.message ?? ""}>
              <Input
                type="number"
                step="0.1"
                {...register("vitals.temperatureCelsius", { valueAsNumber: true })}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Medications</legend>
          {medFields.map((field, i) => (
            <div key={field.id} className="rounded-md border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Medication {i + 1}</span>
                <button type="button" onClick={() => removeMed(i)} className="text-muted-foreground hover:text-destructive">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <Field label="Name *" error={errors.medications?.[i]?.name?.message ?? ""}>
                <Input {...register(`medications.${i}.name`)} placeholder="e.g. Metformin" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Dose *" error={errors.medications?.[i]?.doseAmount?.message ?? ""}>
                  <Input {...register(`medications.${i}.doseAmount`)} placeholder="500" />
                </Field>
                <Field label="Unit *" error={errors.medications?.[i]?.doseUnit?.message ?? ""}>
                  <Input {...register(`medications.${i}.doseUnit`)} placeholder="mg" />
                </Field>
                <Field label="Frequency *" error={errors.medications?.[i]?.frequency?.message ?? ""}>
                  <Input {...register(`medications.${i}.frequency`)} placeholder="twice daily" />
                </Field>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendMed({
                medicationId: crypto.randomUUID(),
                name: "",
                doseAmount: "",
                doseUnit: "mg",
                frequency: "",
              })
            }
          >
            <PlusIcon className="mr-1 h-3 w-3" /> Add medication
          </Button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Diagnoses</legend>
          {diagFields.map((field, i) => (
            <div key={field.id} className="rounded-md border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Diagnosis {i + 1}</span>
                <button type="button" onClick={() => removeDiag(i)} className="text-muted-foreground hover:text-destructive">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ICD-10 code *" error={errors.diagnoses?.[i]?.code?.message ?? ""}>
                  <Input
                    {...register(`diagnoses.${i}.code`)}
                    placeholder="e.g. J06.9"
                    className="font-mono"
                  />
                </Field>
                <Field label="Diagnosed date *" error={errors.diagnoses?.[i]?.diagnosedAt?.message ?? ""}>
                  <Input type="date" {...register(`diagnoses.${i}.diagnosedAt`)} />
                </Field>
              </div>
              <Field label="Description *" error={errors.diagnoses?.[i]?.description?.message ?? ""}>
                <Input
                  {...register(`diagnoses.${i}.description`)}
                  placeholder="e.g. Upper respiratory infection"
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendDiag({
                diagnosisId: crypto.randomUUID(),
                code: "",
                description: "",
                diagnosedAt: new Date().toISOString().split("T")[0] ?? "",
              })
            }
          >
            <PlusIcon className="mr-1 h-3 w-3" /> Add diagnosis
          </Button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Attachments ({attFields.length}/10)
          </legend>
          {attFields.map((field, i) => (
            <div key={field.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm truncate">{field.fileName}</span>
              <button type="button" onClick={() => removeAtt(i)} className="ml-2 text-muted-foreground hover:text-destructive">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          {errors.attachments?.message && (
            <p className="text-xs text-destructive">{errors.attachments.message}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={attFields.length >= 10}
          >
            <PlusIcon className="mr-1 h-3 w-3" /> Add attachment
          </Button>
        </fieldset>

        {(createMutation.error || updateMutation.error) && (
          <p className="text-xs text-destructive">
            {(createMutation.error ?? updateMutation.error)?.message ?? "Save failed."}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isBusy}>
            {isBusy ? "Saving…" : isNew ? "Create record" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isBusy}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}