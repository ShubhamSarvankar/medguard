package com.medguard.app.data.p2p

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject

private const val EC_ALGORITHM = "EC"
private const val EC_CURVE = "P-256"
private const val ECDH_ALGORITHM = "ECDH"
private const val HKDF_HASH = "SHA-256"
private const val AES_ALGORITHM = "AES"
private const val DERIVED_KEY_LENGTH = 32

class EcdhKeyExchange @Inject constructor() {

    fun generateKeyPair(): KeyPair {
        val generator = KeyPairGenerator.getInstance(EC_ALGORITHM)
        val spec = java.security.spec.ECGenParameterSpec(EC_CURVE)
        generator.initialize(spec)
        return generator.generateKeyPair()
    }

    fun encodePublicKey(keyPair: KeyPair): ByteArray =
        keyPair.public.encoded

    fun decodePublicKey(encoded: ByteArray): PublicKey {
        val spec = X509EncodedKeySpec(encoded)
        return KeyFactory.getInstance(EC_ALGORITHM).generatePublic(spec)
    }

    // Both peers call this with their own private key + the other's public key; the derived key is identical on both sides.
    // Pass a shared nonce as salt if one is exchanged during the handshake.
    fun deriveSessionKey(
        localKeyPair: KeyPair,
        peerPublicKey: PublicKey,
        salt: ByteArray = "medguard-ecdh-salt".toByteArray(),
    ): SecretKey {
        val agreement = KeyAgreement.getInstance(ECDH_ALGORITHM)
        agreement.init(localKeyPair.private)
        agreement.doPhase(peerPublicKey, true)
        val sharedSecret = agreement.generateSecret()

        val derivedBytes = hkdf(
            ikm = sharedSecret,
            salt = salt,
            info = "medguard-session-key".toByteArray(),
            length = DERIVED_KEY_LENGTH,
        )

        return SecretKeySpec(derivedBytes, AES_ALGORITHM)
    }

    // HKDF (RFC 5869): extract → HMAC-SHA256(salt, ikm); expand → iterative HMAC until length bytes.
    private fun hkdf(
        ikm: ByteArray,
        salt: ByteArray,
        info: ByteArray,
        length: Int,
    ): ByteArray {
        val mac = javax.crypto.Mac.getInstance("Hmac$HKDF_HASH")

        mac.init(javax.crypto.spec.SecretKeySpec(salt, "Hmac$HKDF_HASH"))
        val prk = mac.doFinal(ikm)

        mac.init(javax.crypto.spec.SecretKeySpec(prk, "Hmac$HKDF_HASH"))
        val result = ByteArray(length)
        var t = ByteArray(0)
        var offset = 0
        var counter = 1
        while (offset < length) {
            mac.update(t)
            mac.update(info)
            mac.update(counter.toByte())
            t = mac.doFinal()
            val toCopy = minOf(t.size, length - offset)
            t.copyInto(result, offset, 0, toCopy)
            offset += toCopy
            counter++
        }
        return result
    }
}