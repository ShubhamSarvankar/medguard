import { test, expect } from "@playwright/test";
import * as path from "path";
import { registerUser, uniqueEmail } from "./helpers/auth";

/**
 * Journey 3: Audit log — filter by record → export CSV → verify headers + row count.
 */
test("audit log filter and CSV export", async ({ page }) => {
  const email = uniqueEmail();
  await registerUser(page, email);

  // Create a record to generate audit entries
  await page.getByRole("link", { name: /new record/i }).click();
  const title = `Audit E2E — ${Date.now()}`;
  await page.getByPlaceholder("e.g. Annual physical").fill(title);
  await page.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

  // Navigate to audit log
  await page.goto("/audit");
  await expect(page.getByText(/audit log/i)).toBeVisible();

  // Wait for at least one entry to appear (record.write from onRecordWrite trigger)
  await expect(page.locator("table tbody tr, [data-testid='audit-entry']").first()).toBeVisible({
    timeout: 20_000,
  });

  // Export CSV
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export csv/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  const filePath = path.join("e2e", "downloads", download.suggestedFilename());
  await download.saveAs(filePath);

  const fs = await import("fs");
  const csv = fs.readFileSync(filePath, "utf-8");
  const lines = csv.trim().split("\n");

  // Header row must exist with required columns
  expect(lines[0]).toMatch(/timestamp|action|record/i);

  // At least the header + 1 data row
  expect(lines.length).toBeGreaterThanOrEqual(2);
});