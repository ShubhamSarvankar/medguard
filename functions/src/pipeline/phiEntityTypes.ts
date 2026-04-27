import type { PhiPlaceholder } from "@medguard/types";

export enum PhiEntityType {
  PersonName = "person_name",
  Address = "address",
  Date = "date",
  PhoneNumber = "phone_number",
  FaxNumber = "fax_number",
  Email = "email",
  Ssn = "ssn",
  MedicalRecordNumber = "medical_record_number",
  HealthPlanBeneficiaryNumber = "health_plan_beneficiary_number",
  AccountNumber = "account_number",
  LicenseNumber = "certificate_or_license_number",
  VehicleIdentifier = "vehicle_identifier",
  DeviceIdentifier = "device_identifier",
  Url = "url",
  IpAddress = "ip_address",
  BiometricIdentifier = "biometric_identifier",
  PhotographicImage = "photographic_image",
  Other = "other",
}

// Types without a 1:1 placeholder in @medguard/types map to the closest semantic match.
export const ENTITY_TYPE_TO_PLACEHOLDER: Record<string, PhiPlaceholder> = {
  [PhiEntityType.PersonName]: "[PATIENT_NAME]",
  [PhiEntityType.Address]: "[PATIENT_NAME]",
  [PhiEntityType.Date]: "[DATE]",
  [PhiEntityType.PhoneNumber]: "[PHONE_NUMBER]",
  [PhiEntityType.FaxNumber]: "[PHONE_NUMBER]",
  [PhiEntityType.Email]: "[EMAIL_ADDRESS]",
  [PhiEntityType.Ssn]: "[SSN]",
  [PhiEntityType.MedicalRecordNumber]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.HealthPlanBeneficiaryNumber]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.AccountNumber]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.LicenseNumber]: "[LICENSE_NUMBER]",
  [PhiEntityType.VehicleIdentifier]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.DeviceIdentifier]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.Url]: "[EMAIL_ADDRESS]",
  [PhiEntityType.IpAddress]: "[EMAIL_ADDRESS]",
  [PhiEntityType.BiometricIdentifier]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.PhotographicImage]: "[MEDICAL_RECORD_NUMBER]",
  [PhiEntityType.Other]: "[PATIENT_NAME]",
};

// Process longer/container types first to prevent a short value (e.g. a year, a first name) from corrupting a longer one that contains it.
export const ENTITY_TYPE_PROCESSING_ORDER: string[] = [
  PhiEntityType.MedicalRecordNumber,
  PhiEntityType.Ssn,
  PhiEntityType.DeviceIdentifier,
  PhiEntityType.VehicleIdentifier,
  PhiEntityType.HealthPlanBeneficiaryNumber,
  PhiEntityType.AccountNumber,
  PhiEntityType.LicenseNumber,
  PhiEntityType.Email,
  PhiEntityType.Url,
  PhiEntityType.IpAddress,
  PhiEntityType.PhoneNumber,
  PhiEntityType.FaxNumber,
  PhiEntityType.PersonName,
  PhiEntityType.Address,
  PhiEntityType.BiometricIdentifier,
  PhiEntityType.PhotographicImage,
  PhiEntityType.Date,
  PhiEntityType.Other,
];

export interface ExtractedEntity {
  type: string;
  value: string;
}