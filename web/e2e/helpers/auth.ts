import { Page } from "@playwright/test";

export function uniqueEmail(): string {
  return `e2e.${Math.random().toString(36).slice(2, 10)}@example.com`;
}

export const E2E_PASSWORD = "E2E-TestPass-123!";
export const E2E_DISPLAY_NAME = "Test Patient Alpha";

/**
 * Clears any stale Firebase Auth session, then ensures the page is on /auth
 * and ready for a fresh login or registration.
 *
 * Firebase Auth v9+ stores sessions in IndexedDB (firebaseLocalStorageDb).
 * IndexedDB is scoped to the browser origin, not the Playwright BrowserContext,
 * so sessions leak between tests that share the same browser instance.
 *
 * We surgically delete only the Firebase Auth IndexedDB databases, preserving
 * Firestore's internal IndexedDB state. Then we sign out via the SDK, reload
 * to force re-initialisation, and wait for /auth to appear.
 *
 * When skipIdbClear is true (used by multi-context tests where another context
 * may have an open IDB connection), we only call signOut + reload without
 * deleting the IndexedDB databases, avoiding cross-context IDB conflicts.
 */
async function ensureSignedOut(page: Page, skipIdbClear = false): Promise<void> {
  await page.goto("/");
  await page.waitForURL(/\/(auth|records)/, { timeout: 15_000 });

  await page.evaluate(async (clearIdb: boolean) => {
    if (clearIdb) {
      try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (
            dbInfo.name &&
            (dbInfo.name.includes("firebaseLocalStorage") ||
              dbInfo.name.includes("firebase-heartbeat"))
          ) {
            indexedDB.deleteDatabase(dbInfo.name);
          }
        }
      } catch {
        try { indexedDB.deleteDatabase("firebaseLocalStorageDb"); } catch { /* noop */ }
        try { indexedDB.deleteDatabase("firebase-heartbeat-database"); } catch { /* noop */ }
      }
    }

    const fn = (window as unknown as Record<string, unknown>).__e2eSignOut as
      | (() => Promise<void>)
      | undefined;
    if (fn) {
      try { await fn(); } catch { /* noop */ }
    }
  }, !skipIdbClear);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/auth/, { timeout: 15_000 });
}

export async function registerUser(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
  displayName: string = E2E_DISPLAY_NAME,
  { skipIdbClear = false } = {},
): Promise<void> {
  await ensureSignedOut(page, skipIdbClear);

  await page.getByText("Register").click();
  await page.locator('[autocomplete="name"]').fill(displayName);
  await page.locator('[autocomplete="email"]').fill(email);
  await page.locator('[autocomplete="new-password"]').first().fill(password);
  await page.locator('[autocomplete="new-password"]').last().fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/records/, { timeout: 20_000 });
}

export async function loginUser(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
  { skipIdbClear = false } = {},
): Promise<void> {
  await ensureSignedOut(page, skipIdbClear);

  await page.locator('[autocomplete="email"]').fill(email);
  await page.locator('[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/records/, { timeout: 20_000 });
}