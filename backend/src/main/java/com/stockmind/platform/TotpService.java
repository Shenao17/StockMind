package com.stockmind.platform;

import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Clock;

/**
 * TOTP (RFC 6238): código de 6 dígitos, paso de 30 s, HMAC-SHA1, compatible con Google/Microsoft
 * Authenticator, Aegis, etc. Sin dependencias externas.
 */
@Component
public class TotpService {

    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    static final int STEP_SECONDS = 30;
    private static final int DIGITS = 6;

    private final SecureRandom random = new SecureRandom();
    private final Clock clock;

    public TotpService() {
        this(Clock.systemUTC());
    }

    TotpService(Clock clock) {
        this.clock = clock;
    }

    /** Secreto aleatorio de 160 bits en Base32 (32 caracteres). */
    public String newSecret() {
        byte[] bytes = new byte[20];
        random.nextBytes(bytes);
        return base32(bytes);
    }

    public String otpauthUri(String issuer, String account, String secret) {
        return "otpauth://totp/" + enc(issuer) + ":" + enc(account)
            + "?secret=" + secret + "&issuer=" + enc(issuer) + "&digits=" + DIGITS + "&period=" + STEP_SECONDS;
    }

    public long currentStep() {
        return clock.millis() / 1000 / STEP_SECONDS;
    }

    /**
     * Devuelve el paso (contador) al que corresponde el código, tolerando ±1 paso por desfase
     * de reloj, o -1 si el código no es válido.
     */
    public long matchingStep(String secret, String code) {
        if (code == null || !code.matches("\\d{6}")) return -1;
        long now = currentStep();
        long found = -1;
        // Se recorren siempre los 3 pasos (tiempo casi constante)
        for (long step = now - 1; step <= now + 1; step++) {
            if (constantEquals(codeAt(secret, step), code)) found = step;
        }
        return found;
    }

    /** Código vigente ahora (para pruebas y para mostrar el primer código de comprobación). */
    public String currentCode(String secret) {
        return codeAt(secret, currentStep());
    }

    String codeAt(String secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(base32Decode(secret), "HmacSHA1"));
            byte[] h = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int o = h[h.length - 1] & 0x0f;
            int bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
            return String.format("%0" + DIGITS + "d", bin % 1_000_000);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo calcular el código TOTP", e);
        }
    }

    private static boolean constantEquals(String a, String b) {
        return java.security.MessageDigest.isEqual(a.getBytes(), b.getBytes());
    }

    private static String enc(String v) {
        return java.net.URLEncoder.encode(v, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
    }

    static String base32(byte[] data) {
        StringBuilder out = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(ALPHABET.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) out.append(ALPHABET.charAt((buffer << (5 - bits)) & 31));
        return out.toString();
    }

    static byte[] base32Decode(String s) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0, bits = 0;
        for (char c : s.toCharArray()) {
            int v = ALPHABET.indexOf(c);
            if (v < 0) continue;
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }
}
