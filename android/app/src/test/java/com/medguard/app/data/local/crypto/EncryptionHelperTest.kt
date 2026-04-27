package com.medguard.app.data.local.crypto

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class EncryptionHelperTest {

    private lateinit var helper: EncryptionHelper
    private lateinit var key: SecretKey
    private lateinit var wrongKey: SecretKey

    @BeforeEach
    fun setUp() {
        helper = EncryptionHelper()
        key = generateTestKey()
        wrongKey = generateTestKey()
    }

    @Test
    fun `encrypt then decrypt roundtrip returns original plaintext`() {
        val plaintext = "Patient record data — sensitive content".toByteArray()
        val payload = helper.encrypt(plaintext, key)
        val decrypted = helper.decrypt(payload, key)
        assertArrayEquals(plaintext, decrypted)
    }

    @Test
    fun `encrypt produces non-empty ciphertext iv and tag`() {
        val plaintext = "test".toByteArray()
        val payload = helper.encrypt(plaintext, key)
        assert(payload.ciphertext.isNotEmpty())
        assert(payload.iv.isNotEmpty())
        assert(payload.tag.isNotEmpty())
    }

    @Test
    fun `iv is 12 bytes`() {
        val payload = helper.encrypt("test".toByteArray(), key)
        assert(payload.iv.size == 12)
    }

    @Test
    fun `tag is 16 bytes`() {
        val payload = helper.encrypt("test".toByteArray(), key)
        assert(payload.tag.size == 16)
    }

    @Test
    fun `ciphertext differs from plaintext`() {
        val plaintext = "sensitive data".toByteArray()
        val payload = helper.encrypt(plaintext, key)
        assert(!payload.ciphertext.contentEquals(plaintext))
    }

    @Test
    fun `decryption with wrong key throws exception`() {
        val plaintext = "test data".toByteArray()
        val payload = helper.encrypt(plaintext, key)
        assertThrows(Exception::class.java) {
            helper.decrypt(payload, wrongKey)
        }
    }

    @Test
    fun `two encryptions of same plaintext produce different ciphertexts`() {
        val plaintext = "same input".toByteArray()
        val payload1 = helper.encrypt(plaintext, key)
        val payload2 = helper.encrypt(plaintext, key)
        // IVs must be unique per encryption
        assert(!payload1.iv.contentEquals(payload2.iv))
    }

    @Test
    fun `empty plaintext encrypts and decrypts correctly`() {
        val plaintext = ByteArray(0)
        val payload = helper.encrypt(plaintext, key)
        val decrypted = helper.decrypt(payload, key)
        assertArrayEquals(plaintext, decrypted)
    }

    private fun generateTestKey(): SecretKey {
        val kg = KeyGenerator.getInstance("AES")
        kg.init(256)
        return kg.generateKey()
    }
}