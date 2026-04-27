package com.medguard.app

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Phase 8.6 — Android compliance checks.
 *
 * Verifies programmatically checkable items from the compliance checklist:
 *   NFR-COMPLY-02  No PHI in Android Log calls
 *   NFR-COMPLY-05  No third-party analytics SDK in build dependencies
 *
 * These tests scan source files and build configuration at test time.
 * They run as standard JUnit 5 unit tests (no Android framework required).
 */
class ComplianceTest {

    // The working directory for unit tests is the module root (android/app/).
    private val moduleDir = File(".")
    private val srcMainDir = File(moduleDir, "src/main/java/com/medguard/app")

    // ---------------------------------------------------------------------------
    // NFR-COMPLY-02: No PHI in Android Log calls
    // ---------------------------------------------------------------------------

    @Test
    fun `no Android Log calls reference PHI record field names`() {
        val phiPatterns = listOf(
            Regex("""Log\.[deiw]\(.*record\.notes"""),
            Regex("""Log\.[deiw]\(.*record\.title"""),
            Regex("""Log\.[deiw]\(.*\.name\b"""),
            Regex("""Log\.[deiw]\(.*ssn""", RegexOption.IGNORE_CASE),
            Regex("""Log\.[deiw]\(.*phone""", RegexOption.IGNORE_CASE),
        )

        val violations = mutableListOf<String>()
        srcMainDir.walkTopDown()
            .filter { it.extension == "kt" }
            .forEach { file ->
                file.readLines().forEachIndexed { lineIdx, line ->
                    for (pattern in phiPatterns) {
                        if (pattern.containsMatchIn(line)) {
                            violations += "${file.path}:${lineIdx + 1}: $line"
                        }
                    }
                }
            }

        assertFalse(violations.isNotEmpty()) {
            "PHI field references found in Android Log calls:\n${violations.joinToString("\n")}"
        }
    }

    // ---------------------------------------------------------------------------
    // NFR-COMPLY-05: No third-party analytics SDK in app/build.gradle.kts
    // ---------------------------------------------------------------------------

    @Test
    fun `build gradle does not declare third-party analytics dependencies`() {
        val forbiddenPackages = listOf(
            "firebase-analytics",
            "mixpanel",
            "amplitude",
            "segment",
            "google-analytics",
            "appsflyer",
            "adjust",
            "braze",
        )

        val buildGradle = File(moduleDir, "build.gradle.kts")
        if (!buildGradle.exists()) return   // skip if file not found

        val content = buildGradle.readText()
        for (pkg in forbiddenPackages) {
            assertFalse(content.contains(pkg, ignoreCase = true)) {
                "Forbidden analytics package '$pkg' found in build.gradle.kts"
            }
        }
    }

    @Test
    fun `version catalog does not declare third-party analytics libraries`() {
        val forbiddenPackages = listOf(
            "firebase-analytics",
            "mixpanel",
            "amplitude",
            "segment",
            "google-analytics",
        )

        val versionCatalog = File(moduleDir, "../gradle/libs.versions.toml")
        if (!versionCatalog.exists()) return

        val content = versionCatalog.readText()
        for (pkg in forbiddenPackages) {
            assertFalse(content.contains(pkg, ignoreCase = true)) {
                "Forbidden analytics library '$pkg' found in libs.versions.toml"
            }
        }
    }
}
