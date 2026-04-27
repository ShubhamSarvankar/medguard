import { Badge } from "@/components/ui/badge";

const PLACEHOLDER_CONFIG: Record<string, { label: string; className: string }> = {
  "[PATIENT_NAME]": {
    label: "Patient Name",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  },
  "[DATE_OF_BIRTH]": {
    label: "Date of Birth",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  "[SSN]": {
    label: "SSN",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  "[PHONE_NUMBER]": {
    label: "Phone",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  "[EMAIL_ADDRESS]": {
    label: "Email",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  },
  "[MEDICAL_RECORD_NUMBER]": {
    label: "MRN",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  "[PHYSICIAN_NAME]": {
    label: "Physician",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  },
  "[LICENSE_NUMBER]": {
    label: "License #",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  },
  "[ORGANIZATION]": {
    label: "Organization",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  "[DATE]": {
    label: "Date",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
};

const PLACEHOLDER_REGEX = /\[(PATIENT_NAME|DATE_OF_BIRTH|SSN|PHONE_NUMBER|EMAIL_ADDRESS|MEDICAL_RECORD_NUMBER|PHYSICIAN_NAME|LICENSE_NUMBER|ORGANIZATION|DATE)\]/g;

interface PhiRedactionBadgeProps {
  placeholder: string;
}

export function PhiRedactionBadge({ placeholder }: PhiRedactionBadgeProps) {
  const config = PLACEHOLDER_CONFIG[placeholder];
  if (!config) return <span>{placeholder}</span>;

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 border-0 font-normal text-xs ${config.className}`}
      data-testid="phi-badge"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0" aria-hidden>
        <circle cx="5" cy="5" r="4" fill="currentColor" opacity={0.4} />
      </svg>
      {config.label} redacted
    </Badge>
  );
}

interface RedactedTextProps {
  text: string;
}

export function RedactedText({ text }: RedactedTextProps) {
  const parts: (string | { placeholder: string; key: number })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ placeholder: match[0], key: keyCounter++ });
    lastIndex = PLACEHOLDER_REGEX.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <span>
      {parts.map((part) =>
        typeof part === "string" ? (
          part
        ) : (
          <PhiRedactionBadge key={part.key} placeholder={part.placeholder} />
        ),
      )}
    </span>
  );
}