import { test, expect, type Page } from "./fixtures";
import { registerUser, loginUser, uniqueEmail, E2E_PASSWORD } from "./helpers/auth";

/**
 * Journey 4: Code share — patient generates a code on Android/web; caretaker
 * enters it at /share/accept → consent → record appears in caretaker list.
 *
 * This test uses two browser contexts to simulate two distinct users:
 *   ctx A = record owner (patient)
 *   ctx B = recipient (caretaker)
 */
test("code share: patient generates code, caretaker accepts", async ({ browser }) => {
  const patientEmail = uniqueEmail();
  const caretakerEmail = uniqueEmail();

  const patientCtx = await browser.newContext();
  const caretakerCtx = await browser.newContext();
  const patientPage = await patientCtx.newPage();
  const caretakerPage = await caretakerCtx.newPage();

  try {
    // ── Patient: register, create record, generate share code ─────────────────
    await registerUser(patientPage, patientEmail);

    await patientPage.getByRole("link", { name: /new record/i }).click();
    const title = `Share Code E2E — ${Date.now()}`;
    await patientPage.getByPlaceholder("e.g. Annual physical").fill(title);
    await patientPage.getByRole("button", { name: "Create record" }).click();
    await expect(patientPage.getByText(title)).toBeVisible({ timeout: 15_000 });

    await patientPage.getByText(title).click();
    await expect(patientPage).toHaveURL(/\/records\/.+/);

    // Initiate code share: SharePanel requires two steps —
    // first "Generate share code" opens the form, then "Generate" calls the function.
    await patientPage.getByRole("button", { name: /generate share code/i }).click();
    await patientPage.getByRole("button", { name: "Generate" }).click();

    // The code is rendered as a <p> with class "font-mono" once the function returns.
    const codeLocator = patientPage.locator("p.font-mono");
    await expect(codeLocator).toBeVisible({ timeout: 15_000 });
    const shareCode = (await codeLocator.textContent())?.trim();
    expect(shareCode).toMatch(/^[A-Z0-9]{6}$/);

    // ── Caretaker: register and accept share code ─────────────────────────────
    await registerUser(caretakerPage, caretakerEmail, undefined, undefined, { skipIdbClear: true });
    await caretakerPage.goto("/share/accept");

    await caretakerPage.locator("#share-code").fill(shareCode!);
    await caretakerPage.getByRole("button", { name: "Accept Share" }).click();

    // Redirected to the shared record detail
    await expect(caretakerPage).toHaveURL(/\/records\/.+/, { timeout: 20_000 });
    await expect(caretakerPage.getByText(title)).toBeVisible({ timeout: 10_000 });
  } finally {
    await patientCtx.close();
    await caretakerCtx.close();
  }
});