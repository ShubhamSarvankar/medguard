import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

// React Hook Form's valueAsNumber produces NaN for empty number inputs.
// z.number().optional() rejects NaN, so we coerce it to undefined first.
const nanToUndefined = (v: unknown) =>
  typeof v === "number" && isNaN(v) ? undefined : v;

export const vitalsSchema = z.object({
  bloodPressureSystolic: z.preprocess(
    nanToUndefined,
    z.number({ invalid_type_error: "Must be a number" }).int().min(40).max(300).optional(),
  ),
  bloodPressureDiastolic: z.preprocess(
    nanToUndefined,
    z.number({ invalid_type_error: "Must be a number" }).int().min(20).max(200).optional(),
  ),
  heartRateBpm: z.preprocess(
    nanToUndefined,
    z.number({ invalid_type_error: "Must be a number" }).int().min(20).max(300).optional(),
  ),
  weightKg: z.preprocess(
    nanToUndefined,
    z.number({ invalid_type_error: "Must be a number" }).positive().max(500).optional(),
  ),
  temperatureCelsius: z.preprocess(
    nanToUndefined,
    z.number({ invalid_type_error: "Must be a number" }).min(25).max(45).optional(),
  ),
});

export const medicationSchema = z.object({
  medicationId: z.string(),
  name: z.string().min(1, "Medication name is required"),
  doseAmount: z.string().min(1, "Dose is required"),
  doseUnit: z.string().min(1, "Unit is required"),
  frequency: z.string().min(1, "Frequency is required"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const diagnosisSchema = z.object({
  diagnosisId: z.string(),
  code: z
    .string()
    .min(1, "ICD-10 code is required")
    .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/, "Enter a valid ICD-10 code (e.g. J06.9)"),
  description: z.string().min(1, "Description is required"),
  diagnosedAt: z.string(),
});

export const attachmentSchema = z.object({
  attachmentId: z.string(),
  fileName: z.string(),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({ message: "Only PDF, JPEG, and PNG files are allowed" }),
  }),
  sizeBytes: z
    .number()
    .max(MAX_FILE_SIZE_BYTES, "File must be 20 MB or smaller"),
  storagePath: z.string().optional(),
});

export const recordFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  notes: z.string().max(10000, "Notes must be 10,000 characters or fewer").optional(),
  visitDate: z
    .string()
    .min(1, "Visit date is required")
    .refine((val) => !isNaN(Date.parse(val)), "Enter a valid date"),
  vitals: vitalsSchema.optional(),
  medications: z
    .array(medicationSchema)
    .max(50, "Maximum 50 medications per record"),
  diagnoses: z
    .array(diagnosisSchema)
    .max(50, "Maximum 50 diagnoses per record"),
  attachments: z
    .array(attachmentSchema)
    .max(10, "Maximum 10 attachments per record"),
});

export type RecordFormValues = z.infer<typeof recordFormSchema>;
export type MedicationFormValues = z.infer<typeof medicationSchema>;
export type DiagnosisFormValues = z.infer<typeof diagnosisSchema>;
export type AttachmentFormValues = z.infer<typeof attachmentSchema>;