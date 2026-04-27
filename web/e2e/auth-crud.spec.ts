import { test, expect } from "@playwright/test";
import { registerUser, uniqueEmail } from "./helpers/auth";

/**
 * Journey 1: Register → login → create record (title + notes) → edit → delete.
 */
test("register, create record, edit, delete", async ({ page }) => {
  const email = uniqueEmail();
  await registerUser(page, email);
  await expect(page).toHaveURL(/\/records/);
  await expect(page.getByText("Medical Records")).toBeVisible();

  // Create record
  await page.getByRole("link", { name: /new record/i }).click();
  await expect(page).toHaveURL(/\/records\/new\/edit/);

  const title = `E2E Annual Checkup — ${Date.now()}`;
  const notes = "Patient Test Alpha. BP 120/80. SSN: 000-00-0001. No real PHI.";
  await page.getByPlaceholder("e.g. Annual physical").fill(title);
  await page.getByPlaceholder("Free-text clinical notes").fill(notes);
  await page.getByRole("button", { name: "Create record" }).click();

  // Back on records list — record visible
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

  // Navigate to detail
  await page.getByText(title).click();
  await expect(page).toHaveURL(/\/records\/.+/);
  // PHI pipeline replaces "Patient Test Alpha" and "000-00-0001" — assert on surviving text
  await expect(page.getByText(/BP 120\/80/)).toBeVisible();

  // Edit record
  await page.getByRole("link", { name: /edit/i }).first().click();
  await expect(page).toHaveURL(/\/edit/);
  const updatedNotes = "Follow-up in 6 months. BP stable.";
  const notesTextarea = page.getByPlaceholder("Free-text clinical notes");
  await notesTextarea.clear();
  await notesTextarea.fill(updatedNotes);
  await page.getByRole("button", { name: "Save changes" }).click();

  // Detail page loads after save — title confirms we're on the right record
  await expect(page).toHaveURL(/\/records\/.+[^edit]/);
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

  // Delete record
  await page.getByRole("button", { name: /delete/i }).first().click();
  // Confirm in alert dialog (scope to dialog to avoid matching the trigger button)
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  // Back on records list — record gone
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByText(title)).not.toBeVisible({ timeout: 10_000 });
});