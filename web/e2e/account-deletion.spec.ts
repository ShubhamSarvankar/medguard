import { test, expect } from "@playwright/test";
import { registerUser, loginUser, uniqueEmail } from "./helpers/auth";

const DELETE_CONFIRM_PHRASE = "DELETE MY DATA";

/**
 * Journey 5: Account deletion — confirm phrase → deletion request submitted →
 * after the deletion window the login attempt fails.
 *
 * The 30-day deletion window cannot be fast-forwarded in tests, so this
 * journey verifies through the "deletion request submitted" confirmation state.
 * Full deletion (Auth account removed) is covered by the integration test
 * in functions/src/__tests__/security.integration.test.ts.
 */
test("account deletion: confirm phrase submits deletion request", async ({ page }) => {
  const email = uniqueEmail();
  await registerUser(page, email);

  await page.goto("/profile");
  await expect(page.getByText("Delete account")).toBeVisible();

  // Type the confirmation phrase
  await page.getByPlaceholder(DELETE_CONFIRM_PHRASE).fill(DELETE_CONFIRM_PHRASE);

  // Submit button enabled once phrase matches
  const submitBtn = page.getByRole("button", { name: "Submit deletion request" });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  // Confirmation message shown — request has been submitted
  await expect(
    page.getByText(/deletion request has been submitted/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/30 days/i),
  ).toBeVisible();
});

test("account deletion: submit button disabled without correct phrase", async ({ page }) => {
  const email = uniqueEmail();
  await registerUser(page, email);

  await page.goto("/profile");
  await page.getByPlaceholder(DELETE_CONFIRM_PHRASE).fill("wrong phrase");

  const submitBtn = page.getByRole("button", { name: "Submit deletion request" });
  await expect(submitBtn).toBeDisabled();
});