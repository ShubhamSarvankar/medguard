import { test, expect } from "@playwright/test";
import { registerUser, uniqueEmail } from "./helpers/auth";

/**
 * Journey 2: Open record → request AI summary → disclaimer + "AI-generated" label shown.
 */
test("summarize record shows disclaimer and AI label", async ({ page }) => {
  const email = uniqueEmail();
  await registerUser(page, email);

  // Create a record to summarize
  await page.getByRole("link", { name: /new record/i }).click();
  const title = `Summary E2E — ${Date.now()}`;
  await page.getByPlaceholder("e.g. Annual physical").fill(title);
  await page.getByPlaceholder("Free-text clinical notes").fill(
    "Patient Test Alpha. Routine checkup. SSN: 000-00-0002.",
  );
  await page.getByRole("button", { name: "Create record" }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

  // Open record detail
  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/records\/.+/);

  // Request summary (look for summarize button)
  const summarizeBtn = page.getByRole("button", { name: /summarize|get summary/i });
  await expect(summarizeBtn).toBeVisible({ timeout: 5_000 });
  await summarizeBtn.click();

  // Summary + disclaimer + AI label visible
  await expect(
    page.getByText(/this summary is ai.generated/i),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/disclaimer|not substitute/i)).toBeVisible({
    timeout: 5_000,
  });
});