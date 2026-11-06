package com.stockmind.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Cifra el secreto TOTP en la base de datos (AES-256-GCM): quien lea la tabla users no puede
 * generar códigos. La llave sale de STOCKMIND_MFA_KEY; si no está definida se deriva del secreto
 * JWT (válido en desarrollo; en producción define una propia y distinta).
 */
@Component
public class MfaCrypto {

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public MfaCrypto(@Value("${stockmind.mfa.key:}") String configuredKey,
                     @Value("${jwt.secret}") String jwtSecret) {
        try {
            String material = (configuredKey == null || configuredKey.isBlank())
                ? "stockmind-mfa:" + jwtSecret : configuredKey;
            byte[] k = MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
            this.key = new SecretKeySpec(k, "AES");
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public String encrypt(String plain) {
        try {
            byte[] iv = new byte[12];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo cifrar", e);
        }
    }

    public String decrypt(String encoded) {
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo descifrar", e);
        }
    }
}
