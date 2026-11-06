package com.stockmind.platform;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

/** TOTP contra los vectores oficiales del RFC 6238 (SHA-1, secreto ASCII "12345678901234567890"). */
class TotpServiceTest {

    static final String SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // Base32 de "12345678901234567890"

    private static TotpService at(long epochSeconds) {
        return new TotpService(Clock.fixed(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Reproduce los vectores del RFC 6238 (los 6 últimos dígitos)")
    void rfcVectors() {
        assertEquals("287082", at(59L).currentCode(SECRET));
        assertEquals("081804", at(1111111109L).currentCode(SECRET));
        assertEquals("050471", at(1111111111L).currentCode(SECRET));
        assertEquals("005924", at(1234567890L).currentCode(SECRET));
        assertEquals("279037", at(2000000000L).currentCode(SECRET));
    }

    @Test
    @DisplayName("Acepta el paso anterior y el siguiente, pero no uno más lejano")
    void window() {
        TotpService t = at(1111111109L);
        long step = t.currentStep();
        assertEquals(step, t.matchingStep(SECRET, t.codeAt(SECRET, step)));
        assertEquals(step - 1, t.matchingStep(SECRET, t.codeAt(SECRET, step - 1)));
        assertEquals(step + 1, t.matchingStep(SECRET, t.codeAt(SECRET, step + 1)));
        assertEquals(-1, t.matchingStep(SECRET, t.codeAt(SECRET, step + 2)));
        assertEquals(-1, t.matchingStep(SECRET, "abc123"));
        assertEquals(-1, t.matchingStep(SECRET, null));
    }

    @Test
    @DisplayName("El secreto nuevo es Base32 de 32 caracteres y distinto cada vez")
    void secrets() {
        TotpService t = new TotpService();
        String a = t.newSecret(), b = t.newSecret();
        assertTrue(a.matches("[A-Z2-7]{32}"));
        assertNotEquals(a, b);
        assertTrue(t.otpauthUri("StockMind", "a@b.com", a).startsWith("otpauth://totp/StockMind:a%40b.com?secret=" + a));
    }
}
