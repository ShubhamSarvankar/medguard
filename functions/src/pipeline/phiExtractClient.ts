import type { ExtractedEntity } from "./phiEntityTypes";

// PRODUCTION: replace this mock with a real Bedrock/Claude call (InvokeModelCommand).
// Required IAM: bedrock:InvokeModel on the target model ARN.
// Required package: @aws-sdk/client-bedrock-runtime (already in package.json).
// Caller contract is identical — only this function body changes.
export async function extractPhiEntities(
  text: string
): Promise<ExtractedEntity[]> {
  if (!text || text.trim().length === 0) return [];

  // Simulates LLM latency; keeps integration tests deterministic without a live Bedrock endpoint.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  function add(type: string, value: string): void {
    if (value && !seen.has(value)) {
      seen.add(value);
      entities.push({ type, value });
    }
  }

  const ssnMatch = text.match(
    /\b(?!000|666|9\d{2})\d{3}[- ]?\d{2}[- ]\d{4}\b/g
  );
  ssnMatch?.forEach((v) => add("ssn", v));

  const emailMatch = text.match(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  );
  emailMatch?.forEach((v) => add("email", v));

  const phoneMatch = text.match(
    /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-\s]*\d{3}[\s.\-]\d{4}\b/g
  );
  phoneMatch?.forEach((v) => add("phone_number", v));

  const mrnMatch = text.match(
    /\b(?:MRN|Medical\s+Record\s+(?:Number|No\.?|#))\s*[:#]?\s*([A-Z0-9]{5,12})\b/gi
  );
  mrnMatch?.forEach((v) => add("medical_record_number", v));

  const dobMatch = text.match(
    /\b(?:DOB|D\.O\.B|Date\s+of\s+Birth)\s*[:#]?\s*\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/gi
  );
  dobMatch?.forEach((v) => add("date", v));

  const licenseMatch = text.match(
    /\b(?:License\s*(?:No\.?|#)|DEA|NPI)\s*[:#]?\s*[A-Z0-9]{5,12}\b/gi
  );
  licenseMatch?.forEach((v) => add("certificate_or_license_number", v));

  const drMatch = text.match(
    /\b(?:Dr\.?|Doctor|Physician)\s+[A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?\b/g
  );
  drMatch?.forEach((v) => add("person_name", v));

  const patientMatch = text.match(
    /\b(?:Patient(?:\s+Name)?|Name)\s*[:#]\s*([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){1,2})/gi
  );
  patientMatch?.forEach((v) => add("person_name", v));

  const dateMatch = text.match(
    /\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/g
  );
  dateMatch?.forEach((v) => add("date", v));

  return entities;
}