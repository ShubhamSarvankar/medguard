package com.medguard.app.data.local.crypto

import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.subtle.AesGcmJce
import javax.inject.Inject
import javax.inject.Singleton
import javax.crypto.SecretKey

@Singleton
class EncryptionHelper @Inject constructor() {

    init {
        AeadConfig.register()
    }

    fun encrypt(plaintext: ByteArray, key: SecretKey): EncryptedPayload {
        val aead = AesGcmJce(key.encoded)
        // Tink's AesGcmJce.encrypt returns ciphertext with the 12-byte IV prepended
        // and the 16-byte GCM tag appended. We split them out for explicit storage.
        val combined = aead.encrypt(plaintext, null)

        val iv = combined.copyOfRange(0, 12)
        val ciphertextWithTag = combined.copyOfRange(12, combined.size)
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - 16)
        val tag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - 16, ciphertextWithTag.size)

        return EncryptedPayload(ciphertext = ciphertext, iv = iv, tag = tag)
    }

    fun decrypt(payload: EncryptedPayload, key: SecretKey): ByteArray {
        val aead = AesGcmJce(key.encoded)
        val combined = payload.iv + payload.ciphertext + payload.tag
        return aead.decrypt(combined, null)
    }
}