package com.medguard.app.security

import com.medguard.app.di.NetworkModule
import okhttp3.CertificatePinner
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Phase 8.5 — T02: Certificate pinning configuration test.
 *
 * Verifies that the OkHttpClient provided by [NetworkModule] has a
 * [CertificatePinner] configured with the correct Firebase hostname patterns.
 *
 * This is a configuration-level unit test. It does NOT make real network
 * connections — it only inspects the OkHttpClient's pinner setup.
 *
 * PORTFOLIO NOTE: The pin hashes are zero-value placeholders per the Portfolio
 * Addendum (Module 8.1). In production, real SHA-256 hashes extracted from the
 * Firebase leaf certificates replace these placeholders. The test verifies
 * hostname coverage, not hash correctness.
 *
 * T02 manual check (Charles Proxy / mitmproxy):
 *   1. Install a custom CA on a test device.
 *   2. Proxy the device's traffic through Charles/mitmproxy.
 *   3. Activate the production-hash pin set by uncommenting the <pin-set>
 *      block in network_security_config.xml.
 *   4. Launch MedGuard → attempt any Firebase API call.
 *   5. Android must refuse the connection (SSLPeerUnverifiedException).
 */
class NetworkPinningTest {

    // OkHttp 4.x Pin.toString() returns only "sha256/hash", not the hostname pattern.
    // Reflection is the only public-API-free way to verify which hostnames are pinned.
    private fun pinnerPatterns(pinner: CertificatePinner): Set<String> {
        val pinsField = CertificatePinner::class.java.getDeclaredField("pins")
        pinsField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val pins = pinsField.get(pinner) as Set<*>
        return pins.mapNotNullTo(mutableSetOf()) { pin ->
            val patternField = pin!!.javaClass.getDeclaredField("pattern")
            patternField.isAccessible = true
            patternField.get(pin) as? String
        }
    }

    @Test
    fun `provideOkHttpClient returns a client with a non-default CertificatePinner`() {
        val client = NetworkModule.provideOkHttpClient()
        // The default pinner has no configured rules
        assertNotEquals(
            CertificatePinner.DEFAULT,
            client.certificatePinner,
            "OkHttpClient should have a custom CertificatePinner, not the empty default"
        )
    }

    @Test
    fun `certificate pinner covers firebaseapp dot com`() {
        val patterns = pinnerPatterns(NetworkModule.provideOkHttpClient().certificatePinner)
        assertTrue(
            patterns.any { it.contains("firebaseapp.com") },
            "CertificatePinner must include a rule for *.firebaseapp.com"
        )
    }

    @Test
    fun `certificate pinner covers googleapis dot com`() {
        val patterns = pinnerPatterns(NetworkModule.provideOkHttpClient().certificatePinner)
        assertTrue(
            patterns.any { it.contains("googleapis.com") },
            "CertificatePinner must include a rule for *.googleapis.com"
        )
    }

    @Test
    fun `certificate pinner covers cloudfunctions dot net`() {
        val patterns = pinnerPatterns(NetworkModule.provideOkHttpClient().certificatePinner)
        assertTrue(
            patterns.any { it.contains("cloudfunctions.net") },
            "CertificatePinner must include a rule for *.cloudfunctions.net"
        )
    }

    @Test
    fun `certificate pinner covers firebaseio dot com`() {
        val patterns = pinnerPatterns(NetworkModule.provideOkHttpClient().certificatePinner)
        assertTrue(
            patterns.any { it.contains("firebaseio.com") },
            "CertificatePinner must include a rule for *.firebaseio.com"
        )
    }
}
