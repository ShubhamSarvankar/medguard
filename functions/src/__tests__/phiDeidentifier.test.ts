import { describe, it, expect, vi, beforeEach } from "vitest";
import { redactEntities, deidentifyText, deidentifyFields } from "../pipeline/phiDeidentifier";
import type { ExtractedEntity } from "../pipeline/phiEntityTypes";

// ---------------------------------------------------------------------------
// redactEntities — deterministic stage, no LLM involved
// Tests mirror the reference implementation's test suite and extend it for
// MedGuard's placeholder mapping.
// ---------------------------------------------------------------------------

describe("redactEntities — basic replacement", () => {
  it("returns original text when entity list is empty", () => {
    const { text, replacementCount } = redactEntities("Hello world", []);
    expect(text).toBe("Hello world");
    expect(replacementCount).toBe(0);
  });

  it("returns original text when input is empty", () => {
    const entities: ExtractedEntity[] = [{ type: "person_name", value: "John" }];
    const { text } = redactEntities("", entities);
    expect(text).toBe("");
  });

  it("replaces a single entity value", () => {
    const entities: ExtractedEntity[] = [{ type: "person_name", value: "John" }];
    const { text } = redactEntities("Patient is John.", entities);
    expect(text).toBe("Patient is [PATIENT_NAME].");
    expect(text).not.toContain("John");
  });

  it("replaces all occurrences of the same value", () => {
    const entities: ExtractedEntity[] = [{ type: "person_name", value: "John" }];
    const { text, replacementCount } = redactEntities("John met John at the clinic", entities);
    expect(text).toBe("[PATIENT_NAME] met [PATIENT_NAME] at the clinic");
    expect(replacementCount).toBe(2);
  });

  it("replaces multiple distinct values of the same type", () => {
    const entities: ExtractedEntity[] = [
      { type: "person_name", value: "John" },
      { type: "person_name", value: "Jane" },
    ];
    const { text } = redactEntities("John met Jane at the clinic", entities);
    expect(text).toBe("[PATIENT_NAME] met [PATIENT_NAME] at the clinic");
  });

  it("uses word boundaries — does not match substrings within words", () => {
    const entities: ExtractedEntity[] = [{ type: "ssn", value: "MA" }];
    const { text } = redactEntities("See SUMMARY for details", entities);
    expect(text).toBe("See SUMMARY for details");
  });
});

describe("redactEntities — processing order prevents corruption", () => {
  it("processes email before person_name — name inside email not corrupted", () => {
    const entities: ExtractedEntity[] = [
      { type: "email", value: "john.smith@example.com" },
      { type: "person_name", value: "john" },
    ];
    const { text } = redactEntities(
      "Contact john.smith@example.com or john directly",
      entities
    );
    expect(text).toContain("[EMAIL_ADDRESS]");
    expect(text).toContain("[PATIENT_NAME]");
    expect(text).not.toContain("john.smith@example.com");
    expect(text).not.toContain("[PATIENT_NAME].smith@example.com");
  });

  it("processes phone_number before date — year inside phone not corrupted", () => {
    const entities: ExtractedEntity[] = [
      { type: "phone_number", value: "555-268-1985" },
      { type: "date", value: "1985" },
    ];
    const { text } = redactEntities("Call 555-268-1985 for assistance", entities);
    expect(text).toBe("Call [PHONE_NUMBER] for assistance");
    expect(text).not.toContain("555-268-[DATE]");
  });

  it("processes medical_record_number before other — MRN containing org name not corrupted", () => {
    const entities: ExtractedEntity[] = [
      { type: "health_plan_beneficiary_number", value: "AETNA-681277021" },
      { type: "other", value: "AETNA" },
    ];
    const { text } = redactEntities(
      "Insurance: AETNA-681277021 Provider: AETNA",
      entities
    );
    expect(text).toContain("[MEDICAL_RECORD_NUMBER]");
    expect(text).not.toContain("AETNA-681277021");
  });

  it("produces identical output regardless of entity input order", () => {
    const text = "Name: John Email: john@example.com SSN: 123-45-6789";
    const order1: ExtractedEntity[] = [
      { type: "email", value: "john@example.com" },
      { type: "person_name", value: "John" },
      { type: "ssn", value: "123-45-6789" },
    ];
    const order2: ExtractedEntity[] = [
      { type: "ssn", value: "123-45-6789" },
      { type: "person_name", value: "John" },
      { type: "email", value: "john@example.com" },
    ];
    expect(redactEntities(text, order1).text).toBe(redactEntities(text, order2).text);
  });
});

describe("redactEntities — longest value first within type", () => {
  it("replaces full name before partial name", () => {
    const entities: ExtractedEntity[] = [
      { type: "person_name", value: "John" },
      { type: "person_name", value: "John Smith" },
    ];
    const { text } = redactEntities("John Smith called John yesterday", entities);
    expect(text).toBe("[PATIENT_NAME] called [PATIENT_NAME] yesterday");
  });
});

describe("redactEntities — skip tracking", () => {
  it("tracks type when all entities in the group are absent from text", () => {
    const entities: ExtractedEntity[] = [{ type: "person_name", value: "John" }];
    const { text, skippedByType } = redactEntities("Hello world", entities);
    expect(text).toBe("Hello world");
    expect(skippedByType["person_name"]).toBe(1);
  });

  it("does not track type when at least one entity in the group matched", () => {
    const entities: ExtractedEntity[] = [
      { type: "person_name", value: "John" },
      { type: "person_name", value: "Jane" },
    ];
    const { skippedByType } = redactEntities("Hi John", entities);
    expect(skippedByType["person_name"]).toBeUndefined();
  });

  it("tracks multiple fully-skipped types independently", () => {
    const entities: ExtractedEntity[] = [
      { type: "person_name", value: "John" },
      { type: "email", value: "test@example.com" },
    ];
    const { skippedByType } = redactEntities("Hello world", entities);
    expect(skippedByType["person_name"]).toBe(1);
    expect(skippedByType["email"]).toBe(1);
  });

  it("does not double-count a value appearing in two entity entries", () => {
    const entities: ExtractedEntity[] = [
      { type: "person_name", value: "John" },
      { type: "other", value: "John" },
    ];
    const { text } = redactEntities("Contact John for details", entities);
    expect(text).not.toContain("John");
  });
});

describe("redactEntities — placeholder mapping", () => {
  it("maps person_name to [PATIENT_NAME]", () => {
    const { text } = redactEntities("Patient: Alpha", [
      { type: "person_name", value: "Alpha" },
    ]);
    expect(text).toContain("[PATIENT_NAME]");
  });

  it("maps ssn to [SSN]", () => {
    const { text } = redactEntities("SSN 123-45-6789", [
      { type: "ssn", value: "123-45-6789" },
    ]);
    expect(text).toContain("[SSN]");
  });

  it("maps email to [EMAIL_ADDRESS]", () => {
    const { text } = redactEntities("Email: test@example.com", [
      { type: "email", value: "test@example.com" },
    ]);
    expect(text).toContain("[EMAIL_ADDRESS]");
  });

  it("maps phone_number to [PHONE_NUMBER]", () => {
    const { text } = redactEntities("Phone: 555-123-4567", [
      { type: "phone_number", value: "555-123-4567" },
    ]);
    expect(text).toContain("[PHONE_NUMBER]");
  });

  it("maps medical_record_number to [MEDICAL_RECORD_NUMBER]", () => {
    const { text } = redactEntities("MRN: A1234567", [
      { type: "medical_record_number", value: "A1234567" },
    ]);
    expect(text).toContain("[MEDICAL_RECORD_NUMBER]");
  });

  it("maps certificate_or_license_number to [LICENSE_NUMBER]", () => {
    const { text } = redactEntities("License: G98765", [
      { type: "certificate_or_license_number", value: "G98765" },
    ]);
    expect(text).toContain("[LICENSE_NUMBER]");
  });

  it("maps date to [DATE]", () => {
    const { text } = redactEntities("Visit: 04/10/2024", [
      { type: "date", value: "04/10/2024" },
    ]);
    expect(text).toContain("[DATE]");
  });

  it("produces a generic bracket tag for unknown entity types", () => {
    const { text } = redactEntities("Value: XYZ", [
      { type: "some_future_type", value: "XYZ" },
    ]);
    expect(text).toContain("[SOME_FUTURE_TYPE]");
    expect(text).not.toContain("XYZ");
  });
});

// ---------------------------------------------------------------------------
// deidentifyText — full pipeline (mocked extract stage)
// ---------------------------------------------------------------------------

vi.mock("../pipeline/phiExtractClient", () => ({
  extractPhiEntities: vi.fn(),
}));

import { extractPhiEntities } from "../pipeline/phiExtractClient";
const mockExtract = vi.mocked(extractPhiEntities);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deidentifyText — full pipeline", () => {
  it("calls extractPhiEntities and passes result to redaction stage", async () => {
    mockExtract.mockResolvedValue([
      { type: "person_name", value: "Test Alpha" },
      { type: "ssn", value: "123-45-6789" },
    ]);
    const { text, replacementCount } = await deidentifyText(
      "Patient Test Alpha SSN 123-45-6789"
    );
    expect(text).toContain("[PATIENT_NAME]");
    expect(text).toContain("[SSN]");
    expect(text).not.toContain("Test Alpha");
    expect(text).not.toContain("123-45-6789");
    expect(replacementCount).toBe(2);
  });

  it("returns input unchanged when extract returns empty list", async () => {
    mockExtract.mockResolvedValue([]);
    const input = "Routine checkup. No concerns.";
    const { text, replacementCount } = await deidentifyText(input);
    expect(text).toBe(input);
    expect(replacementCount).toBe(0);
  });

  it("returns early without calling extract for empty input", async () => {
    const { text } = await deidentifyText("");
    expect(mockExtract).not.toHaveBeenCalled();
    expect(text).toBe("");
  });

  it("returns early without calling extract for whitespace-only input", async () => {
    await deidentifyText("   ");
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("propagates extract errors to the caller", async () => {
    mockExtract.mockRejectedValue(new Error("Bedrock unavailable"));
    await expect(deidentifyText("some text")).rejects.toThrow("Bedrock unavailable");
  });

  it("disclaimer: all PHI types present in a dense note are redacted", async () => {
    const note = [
      "Patient Name: Test Patient Alpha",
      "DOB: 01/15/1980",
      "SSN: 234-56-7890",
      "Phone: (555) 123-4567",
      "Email: test.patient@example.com",
      "MRN: A9876543",
      "Referred by Dr. Test Physician",
      "License No. G12345",
    ].join(". ");

    mockExtract.mockResolvedValue([
      { type: "person_name", value: "Test Patient Alpha" },
      { type: "date", value: "01/15/1980" },
      { type: "ssn", value: "234-56-7890" },
      { type: "phone_number", value: "(555) 123-4567" },
      { type: "email", value: "test.patient@example.com" },
      { type: "medical_record_number", value: "A9876543" },
      { type: "person_name", value: "Dr. Test Physician" },
      { type: "certificate_or_license_number", value: "G12345" },
    ]);

    const { text, replacementCount } = await deidentifyText(note);

    expect(text).not.toContain("Test Patient Alpha");
    expect(text).not.toContain("01/15/1980");
    expect(text).not.toContain("234-56-7890");
    expect(text).not.toContain("(555) 123-4567");
    expect(text).not.toContain("test.patient@example.com");
    expect(text).not.toContain("A9876543");
    expect(text).not.toContain("Test Physician");
    expect(text).not.toContain("G12345");
    expect(replacementCount).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// deidentifyFields
// ---------------------------------------------------------------------------

describe("deidentifyFields", () => {
  it("processes each field and returns de-identified map", async () => {
    mockExtract
      .mockResolvedValueOnce([{ type: "date", value: "01/15/1980" }])
      .mockResolvedValueOnce([{ type: "person_name", value: "Test Name" }]);

    const result = await deidentifyFields({
      notes: "DOB 01/15/1980",
      title: "Visit with Test Name",
    });
    expect(result.notes).toContain("[DATE]");
    expect(result.title).toContain("[PATIENT_NAME]");
  });

  it("returns empty string fields unchanged", async () => {
    mockExtract.mockResolvedValue([]);
    const result = await deidentifyFields({ notes: "", title: "Routine checkup" });
    expect(result.notes).toBe("");
  });

  it("processes fields concurrently", async () => {
    mockExtract.mockResolvedValue([]);
    const start = Date.now();
    await deidentifyFields({ a: "text", b: "text", c: "text", d: "text" });
    const elapsed = Date.now() - start;
    // Four 50ms mock delays in parallel should finish well under 4 × 50ms
    expect(elapsed).toBeLessThan(150);
  });
});