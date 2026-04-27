package com.medguard.app.data.p2p

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

class EcdhKeyExchangeTest {

    private val exchange = EcdhKeyExchange()

    @Test
    fun `shared secrets are equal when both sides perform ECDH`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()

        val aliceSessionKey = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public)
        val bobSessionKey = exchange.deriveSessionKey(bobKeyPair, aliceKeyPair.public)

        assertArrayEquals(aliceSessionKey.encoded, bobSessionKey.encoded)
    }

    @Test
    fun `session key is 32 bytes`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()

        val sessionKey = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public)

        assertEquals(32, sessionKey.encoded.size)
    }

    @Test
    fun `session key algorithm is AES`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()

        val sessionKey = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public)

        assertEquals("AES", sessionKey.algorithm)
    }

    @Test
    fun `different key pairs produce different session keys`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()
        val charlieKeyPair = exchange.generateKeyPair()

        val keyAB = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public)
        val keyAC = exchange.deriveSessionKey(aliceKeyPair, charlieKeyPair.public)

        assertNotEquals(
            keyAB.encoded.toList(),
            keyAC.encoded.toList(),
        )
    }

    @Test
    fun `public key survives encode and decode round trip`() {
        val keyPair = exchange.generateKeyPair()
        val encoded = exchange.encodePublicKey(keyPair)
        val decoded = exchange.decodePublicKey(encoded)

        assertArrayEquals(keyPair.public.encoded, decoded.encoded)
    }

    @Test
    fun `different salts produce different session keys`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()

        val key1 = exchange.deriveSessionKey(
            aliceKeyPair, bobKeyPair.public, "salt-one".toByteArray()
        )
        val key2 = exchange.deriveSessionKey(
            aliceKeyPair, bobKeyPair.public, "salt-two".toByteArray()
        )

        assertNotEquals(key1.encoded.toList(), key2.encoded.toList())
    }

    @Test
    fun `session key derivation is deterministic for same inputs`() {
        val aliceKeyPair = exchange.generateKeyPair()
        val bobKeyPair = exchange.generateKeyPair()
        val salt = "fixed-salt".toByteArray()

        val key1 = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public, salt)
        val key2 = exchange.deriveSessionKey(aliceKeyPair, bobKeyPair.public, salt)

        assertArrayEquals(key1.encoded, key2.encoded)
    }
}
