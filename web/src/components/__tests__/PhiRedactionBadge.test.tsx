import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhiRedactionBadge, RedactedText } from "../PhiRedactionBadge";

const ALL_PLACEHOLDERS: [string, string][] = [
  ["[PATIENT_NAME]", "Patient Name"],
  ["[DATE_OF_BIRTH]", "Date of Birth"],
  ["[SSN]", "SSN"],
  ["[PHONE_NUMBER]", "Phone"],
  ["[EMAIL_ADDRESS]", "Email"],
  ["[MEDICAL_RECORD_NUMBER]", "MRN"],
  ["[PHYSICIAN_NAME]", "Physician"],
  ["[LICENSE_NUMBER]", "License #"],
  ["[ORGANIZATION]", "Organization"],
  ["[DATE]", "Date"],
];

describe("PhiRedactionBadge", () => {
  it.each(ALL_PLACEHOLDERS)(
    "renders correct label for %s",
    (placeholder, expectedLabel) => {
      render(<PhiRedactionBadge placeholder={placeholder} />);
      expect(screen.getByTestId("phi-badge")).toHaveTextContent(
        `${expectedLabel} redacted`,
      );
    },
  );

  it.each(ALL_PLACEHOLDERS)(
    "applies a color class for %s",
    (placeholder) => {
      render(<PhiRedactionBadge placeholder={placeholder} />);
      const badge = screen.getByTestId("phi-badge");
      expect(badge.className).toMatch(/bg-\w+-100/);
      expect(badge.className).toMatch(/text-\w+-800/);
    },
  );

  it("falls back to raw text for unknown placeholder", () => {
    render(<PhiRedactionBadge placeholder="[UNKNOWN]" />);
    expect(screen.queryByTestId("phi-badge")).toBeNull();
    expect(screen.getByText("[UNKNOWN]")).toBeInTheDocument();
  });
});

describe("RedactedText", () => {
  it("renders plain text with no placeholders unchanged", () => {
    render(<RedactedText text="No PHI here." />);
    expect(screen.getByText("No PHI here.")).toBeInTheDocument();
    expect(screen.queryByTestId("phi-badge")).toBeNull();
  });

  it("renders a single placeholder as a badge", () => {
    render(<RedactedText text="Name: [PATIENT_NAME] is the patient." />);
    expect(screen.getByTestId("phi-badge")).toHaveTextContent(
      "Patient Name redacted",
    );
    expect(screen.getByText(/Name:/)).toBeInTheDocument();
    expect(screen.getByText(/is the patient\./)).toBeInTheDocument();
  });

  it("renders multiple different placeholders", () => {
    render(
      <RedactedText text="[PATIENT_NAME] born [DATE_OF_BIRTH] SSN [SSN]" />,
    );
    const badges = screen.getAllByTestId("phi-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent("Patient Name redacted");
    expect(badges[1]).toHaveTextContent("Date of Birth redacted");
    expect(badges[2]).toHaveTextContent("SSN redacted");
  });

  it("handles adjacent placeholders with no space", () => {
    render(<RedactedText text="[PATIENT_NAME][SSN]" />);
    const badges = screen.getAllByTestId("phi-badge");
    expect(badges).toHaveLength(2);
  });

  it("handles text that is only a placeholder", () => {
    render(<RedactedText text="[EMAIL_ADDRESS]" />);
    expect(screen.getByTestId("phi-badge")).toHaveTextContent(
      "Email redacted",
    );
  });
});