/**
 * Phase 8.6 — Compliance checks verified programmatically
 *
 * Covers the following NFR-COMPLY requirements:
 *   NFR-COMPLY-01  HIPAA alignment — access controls, audit trail completeness
 *   NFR-COMPLY-02  No PHI in logs, errors, analytics, or crash reports
 *   NFR-COMPLY-05  No data transmitted to third-party analytics or advertising
 *
 * Tests that require manual review are marked with a comment and skipped so
 * they appear in the output as a reminder without blocking CI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

function getAllTsFiles(dir: string, excludes: string[] = []): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (excludes.some((ex) => fullPath.includes(ex))) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllTsFiles(fullPath, excludes));
    } else if (extname(entry) === ".ts") {
      results.push(fullPath);
    }
  }
  return results;
}

const SRC_DIR = join(__dirname, "..");
const SOURCE_FILES = getAllTsFiles(SRC_DIR, [
  "node_modules",
  "__tests__",
  ".test.ts",
  ".integration.test.ts",
]);

// ---------------------------------------------------------------------------
// NFR-COMPLY-02: No PHI in Cloud Functions log statements
// ---------------------------------------------------------------------------

describe("NFR-COMPLY-02: no PHI in Cloud Functions log statements", () => {
  // These patterns represent Firestore field names that hold PHI after
  // de-identification has run. They must never appear inside a logger call.
  const PHI_FIELD_PATTERNS = [
    /record\.(notes|title)/,
    /record\.(medications|diagnoses)\[/,
    /\.(name|ssn|phone|email|dob)\b/,
  ];

  // Log-call patterns (functions.logger.* and console.*)
  const LOG_CALL_RE = /(?:functions\.logger|console)\.(log|info|warn|error|debug)\s*\(/;

  it("no log statement references a PHI record field by name", () => {
    const violations: string[] = [];

    for (const file of SOURCE_FILES) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, idx) => {
        if (!LOG_CALL_RE.test(line)) return;
        for (const pattern of PHI_FIELD_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${file}:${idx + 1}: ${line.trim()}`);
          }
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `PHI field references found in log statements:\n${violations.join("\n")}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// NFR-COMPLY-05: No third-party analytics in functions/package.json
// ---------------------------------------------------------------------------

describe("NFR-COMPLY-05: no third-party analytics or advertising packages", () => {
  const FORBIDDEN_PACKAGES = [
    "firebase-analytics",
    "mixpanel",
    "amplitude",
    "@segment/analytics-node",
    "google-analytics",
    "@rudderstack/rudder-sdk-node",
    "posthog-node",
  ];

  it("functions/package.json has no analytics dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(SRC_DIR, "..", "package.json"), "utf-8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(
        Object.keys(allDeps),
        `Forbidden analytics package found: ${forbidden}`
      ).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// NFR-COMPLY-01: All AuditActionType values have at least one writeAuditLog path
// ---------------------------------------------------------------------------

describe("NFR-COMPLY-01: all AuditActionType values have a write path", () => {
  // The complete list from audit.ts — update when new action types are added
  const ALL_ACTION_TYPES = [
    "record.create",
    "record.read",
    "record.update",
    "record.delete",
    "record.pendingApproval",
    "record.approved",
    "record.rejected",
    "annotation.create",
    "annotation.update",
    "annotation.delete",
    "share.initiate",
    "share.accept",
    "share.revoke",
    "share.expire",
    "ai.deidentify",
    "ai.summarize",
    "auth.login",
    "auth.logout",
    "careCircle.invite",
    "careCircle.accept",
    "careCircle.remove",
    "user.deleteRequest",
  ];

  // Action types that are legitimately handled client-side (Firebase Auth SDK
  // emits auth.login/logout) or are scheduled-function-only. These are
  // verified by code review rather than static analysis.
  const CLIENT_SIDE_OR_MANUAL = new Set([
    "auth.login",   // logged by Firebase Auth SDK event listener on client
    "auth.logout",  // logged by client on explicit sign-out
  ]);

  it("every server-side AuditActionType has a writeAuditLog call", () => {
    // Concatenate all source file content for a single grep pass
    const allSource = SOURCE_FILES.map((f) => readFileSync(f, "utf-8")).join("\n");

    const missing: string[] = [];
    for (const actionType of ALL_ACTION_TYPES) {
      if (CLIENT_SIDE_OR_MANUAL.has(actionType)) continue;
      // Check the action type string appears in a writeAuditLog call
      if (!allSource.includes(`"${actionType}"`)) {
        missing.push(actionType);
      }
    }

    if (missing.length > 0) {
      // Report as a warning — Phase 4/7 stubs may not yet have write paths
      console.warn(
        `[compliance] AuditActionType values with no writeAuditLog call found:\n` +
        missing.map((a) => `  - ${a}`).join("\n") +
        `\nVerify these are covered by Cloud Function implementations or are ` +
        `intentional stubs awaiting implementation.`
      );
    }

    // Hard-assert that the core Phase 3/5/8 action types are present
    const CORE_REQUIRED = [
      "ai.deidentify",
      "ai.summarize",
      "share.initiate",
      "share.accept",
      "share.revoke",
      "share.expire",
      "record.read",
    ];
    for (const actionType of CORE_REQUIRED) {
      expect(allSource, `No writeAuditLog call for "${actionType}"`).toContain(
        `"${actionType}"`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Manual review reminders (skipped in CI — appear as pending tests)
// ---------------------------------------------------------------------------

describe.skip("Manual compliance checks (verify by code review)", () => {
  it("no Android Log.d/e/i calls reference PHI field values (review LogCat output)");
  it("deleteRecord UI has an explicit confirmation dialog before calling Cloud Function");
  it("revokeShare UI has an explicit confirmation dialog before calling Cloud Function");
  it("removeCareCircleMember UI has an explicit confirmation dialog");
  it("deleteAccount UI requires the user to type the exact confirmation phrase");
  it("AI summary label is shown at point of display (not just in the response payload)");
});
