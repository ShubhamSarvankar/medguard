import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuditLogPage from "../AuditLogPage";
import { AuditEntryRow, ACTION_LABELS } from "@/components/AuditEntry";
import { exportAuditLogCSV } from "../useAuditLog";
import type { AuditEntry, AuditActionType } from "@medguard/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/features/auth/useAuth", () => ({
  useCurrentUser: () => ({ uid: "test-uid", displayName: "Test User" }),
}));

vi.mock("../useAuditLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../useAuditLog")>();
  return {
    ...actual,
    useAuditLog: () => ({ data: [], isLoading: false, isError: false }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    entryId: "entry-1",
    actorUid: "uid-actor",
    actionType: "record.create",
    timestamp: { seconds: 1_700_000_000, nanoseconds: 0 } as unknown as AuditEntry["timestamp"],
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// AuditEntryRow — all AuditActionType values render
// ---------------------------------------------------------------------------

describe("AuditEntryRow — action type rendering", () => {
  const allActionTypes = Object.keys(ACTION_LABELS) as AuditActionType[];

  it.each(allActionTypes)('renders label for action type "%s"', (actionType) => {
    const entry = makeEntry({ actionType, entryId: actionType });
    const { container } = render(
      <table>
        <tbody>
          <AuditEntryRow entry={entry} />
        </tbody>
      </table>
    );
    expect(container.textContent).toContain(ACTION_LABELS[actionType]);
  });

  it("timestamps are locale-formatted (not raw epoch)", () => {
    const entry = makeEntry();
    const { container } = render(
      <table>
        <tbody>
          <AuditEntryRow entry={entry} />
        </tbody>
      </table>
    );
    // Should NOT contain the raw epoch number
    expect(container.textContent).not.toContain("1700000000");
    // Should contain a human-readable year
    expect(container.textContent).toContain("2023");
  });

  it("renders — for missing recordId", () => {
    const entry = makeEntry({ recordId: undefined });
    const { container } = render(
      <table>
        <tbody>
          <AuditEntryRow entry={entry} />
        </tbody>
      </table>
    );
    expect(container.textContent).toContain("—");
  });
});

// ---------------------------------------------------------------------------
// exportAuditLogCSV — headers correct
// ---------------------------------------------------------------------------

describe("exportAuditLogCSV", () => {
  it("produces correct headers as first line", () => {
    const csv = exportAuditLogCSV([]);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("Date,Action,Record ID,Actor UID,Share ID");
  });

  it("encodes one entry row correctly", () => {
    const entry = makeEntry({
      actorUid: "actor-uid",
      actionType: "share.accept",
      recordId: "rec-123",
      shareId: "share-456",
    });
    const csv = exportAuditLogCSV([entry]);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    const dataRow = rows[1]!;
    expect(dataRow).toContain("share.accept");
    expect(dataRow).toContain("rec-123");
    expect(dataRow).toContain("actor-uid");
    expect(dataRow).toContain("share-456");
  });

  it("escapes double-quotes inside values", () => {
    const entry = makeEntry({ actorUid: 'uid"with"quotes' });
    const csv = exportAuditLogCSV([entry]);
    expect(csv).toContain('uid""with""quotes');
  });

  it("returns header-only string for empty entries array", () => {
    const csv = exportAuditLogCSV([]);
    expect(csv.split("\n")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AuditLogPage — basic rendering
// ---------------------------------------------------------------------------

describe("AuditLogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /audit log/i })).toBeInTheDocument();
  });

  it("renders the export button (disabled when no entries)", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /export csv/i });
    expect(btn).toBeDisabled();
  });

  it("renders the action type filter select", () => {
    renderPage();
    expect(screen.getByRole("combobox", { name: /filter by action type/i })).toBeInTheDocument();
  });

  it("shows empty state when no entries", () => {
    renderPage();
    expect(screen.getByText(/no audit entries found/i)).toBeInTheDocument();
  });

  it("renders date filter inputs", () => {
    renderPage();
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });

  it("shows clear filters button when a filter is active", () => {
    renderPage();
    const select = screen.getByRole("combobox", { name: /filter by action type/i });
    fireEvent.change(select, { target: { value: "record.create" } });
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });
});
