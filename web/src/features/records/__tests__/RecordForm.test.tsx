import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecordForm from "../RecordForm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn().mockResolvedValue("new-record-id");
const mockCreateRecord = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};

vi.mock("@/features/auth/useAuth", () => ({
  useCurrentUser: () => ({ uid: "uid-test", displayName: "Test User" }),
}));

vi.mock("../useRecords", () => ({
  useRecord: () => ({ data: null, isLoading: false }),
  useCreateRecord: () => mockCreateRecord,
  useUpdateRecord: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(recordId = "new") {
  const user = userEvent.setup({ delay: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/records/${recordId}/edit`]}>
        <Routes>
          <Route path="/records/:recordId/edit" element={<RecordForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { user };
}

function submitForm() {
  fireEvent.submit(document.querySelector("form")!);
}

function getFileInput() {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRecord.isPending = false;
  mockCreateRecord.mutateAsync = vi.fn().mockResolvedValue("new-record-id");
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe("RecordForm — required field validation", () => {
  it("shows title error when title is empty on submit", async () => {
    renderForm();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Title is required")).toBeInTheDocument();
    });
  });

  it("shows visit date error when date field is cleared", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "Test");
    const dateInput = document.querySelector<HTMLInputElement>('input[name="visitDate"]')!;
    await user.clear(dateInput);
    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Visit date is required")).toBeInTheDocument();
    });
  });

  it("does not show title error when title is filled", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "Routine checkup");
    submitForm();
    await waitFor(() => {
      expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    });
  });

  it("submit button is disabled while saving", () => {
    mockCreateRecord.isPending = true;
    renderForm();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Length limits
// ---------------------------------------------------------------------------

describe("RecordForm — length limits", () => {
  it("shows error when title exceeds 200 characters", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "A".repeat(201));
    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Title must be 200 characters or fewer")).toBeInTheDocument();
    });
  });

  it("shows error when notes exceed 10000 characters", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "Valid title");
    await user.type(
      screen.getByPlaceholderText(/free-text clinical notes/i),
      "A".repeat(10001)
    );
    submitForm();
    await waitFor(() => {
      expect(screen.getByText("Notes must be 10,000 characters or fewer")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ICD-10 code format
// ---------------------------------------------------------------------------

describe("RecordForm — diagnosis validation", () => {
  it("shows error for invalid ICD-10 code", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "Test visit");
    await user.click(screen.getByRole("button", { name: /add diagnosis/i }));
    await user.type(screen.getByPlaceholderText(/e.g. J06/i), "not-valid");
    await user.type(screen.getByPlaceholderText(/upper respiratory/i), "Test condition");
    submitForm();
    await waitFor(() => {
      expect(
        screen.getByText("Enter a valid ICD-10 code (e.g. J06.9)")
      ).toBeInTheDocument();
    });
  });

  it("accepts a valid ICD-10 code without error", async () => {
    const { user } = renderForm();
    await user.type(screen.getByPlaceholderText(/annual physical/i), "Test visit");
    await user.click(screen.getByRole("button", { name: /add diagnosis/i }));
    await user.type(screen.getByPlaceholderText(/e.g. J06/i), "J06.9");
    submitForm();
    await waitFor(() => {
      expect(
        screen.queryByText("Enter a valid ICD-10 code (e.g. J06.9)")
      ).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Attachment file limits
// ---------------------------------------------------------------------------

describe("RecordForm — attachment validation", () => {
  it("shows error for unsupported MIME type", async () => {
    renderForm();
    const file = new File(["content"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const input = getFileInput();
    Object.defineProperty(input, "files", {
      value: Object.assign([file], { item: (i: number) => [file][i] }),
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.getByText("Only PDF, JPEG, and PNG files are allowed.")).toBeInTheDocument();
    });
  });

  it("shows error when file exceeds 20 MB", async () => {
    const { user } = renderForm();
    const file = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 21 * 1024 * 1024, configurable: true });
    await user.upload(getFileInput(), file);
    await waitFor(() => {
      expect(screen.getByText("File must be 20 MB or smaller.")).toBeInTheDocument();
    });
  });

  it("accepts a valid PDF and shows filename", async () => {
    const { user } = renderForm();
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    await user.upload(getFileInput(), file);
    await waitFor(() => {
      expect(screen.getByText("report.pdf")).toBeInTheDocument();
    });
  });

  it("disables add button at 10 attachments", async () => {
    const { user } = renderForm();
    for (let i = 0; i < 10; i++) {
      await user.upload(
        getFileInput(),
        new File([`c${i}`], `f${i}.pdf`, { type: "application/pdf" })
      );
    }
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add attachment/i })).toBeDisabled();
    });
  });

  it("shows error when attempting to add an 11th attachment", async () => {
    const { user } = renderForm();
    for (let i = 0; i < 10; i++) {
      await user.upload(
        getFileInput(),
        new File([`c${i}`], `f${i}.pdf`, { type: "application/pdf" })
      );
    }
    const extra = new File(["x"], "extra.pdf", { type: "application/pdf" });
    const input = getFileInput();
    Object.defineProperty(input, "files", {
      value: Object.assign([extra], { item: (i: number) => [extra][i] }),
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.getByText("Maximum 10 attachments per record.")).toBeInTheDocument();
    });
  });
});