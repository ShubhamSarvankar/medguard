import { test as base } from "@playwright/test";

// Re-export base test and expect as-is. The cross-test auth contamination
// is handled by ensureSignedOut() in helpers/auth.ts, which surgically
// deletes only the Firebase Auth IndexedDB database without corrupting
// Firestore's internal IndexedDB state.
export const test = base;
export { expect } from "@playwright/test";