package com.stockmind.platform;

import com.stockmind.config.JwtConfig;
import com.stockmind.dto.UserDTO;
import com.stockmind.exception.PinException;
import com.stockmind.model.PlatformBackupCode;
import com.stockmind.model.User;
import com.stockmind.repository.PlatformBackupCodeRepository;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Verificación en dos pasos del equipo de plataforma.
 *
 *  - Segundo factor al iniciar sesión: código TOTP de la app autenticadora (o un código de respaldo).
 *  - PIN: segunda contraseña numérica (mín. 6 dígitos) que se vuelve a pedir para confirmar acciones
 *    sensibles (gestión del equipo, y las aprobaciones de la fase siguiente).
 *  - Ambos se bloquean 15 minutos tras 5 intentos fallidos seguidos.
 */
@Service
@RequiredArgsConstructor
public class PlatformSecurityService {

    public static final String PIN_REGEX = "^\\d{6,10}$";
    public static final String PIN_MSG = "El PIN debe tener entre 6 y 10 dígitos";
    public static final int MAX_ATTEMPTS = 5;
    public static final int LOCK_MINUTES = 15;
    public static final String TYPE_MFA = "MFA";
    public static final String TYPE_ENROLL = "ENROLL";
    private static final String ISSUER = "StockMind";
    private static final String BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private final UserRepository userRepository;
    private final PlatformBackupCodeRepository backupCodeRepository;
    private final PasswordEncoder passwordEncoder;
    private final TotpService totp;
    private final MfaCrypto crypto;
    private final JwtConfig jwtConfig;
    private final SecureRandom random = new SecureRandom();

    // ───────────────────────── Desafíos ─────────────────────────

    public long backupCodesLeft(User user) {
        return backupCodeRepository.countByUserIdAndUsedAtIsNull(user.getId());
    }

    public boolean mfaEnrolled(User user) {
        return user.getMfaEnabledAt() != null && user.getMfaSecret() != null;
    }

    public String challengeFor(User user) {
        return mfaEnrolled(user)
            ? jwtConfig.generateChallenge(user, TYPE_MFA, 5)
            : jwtConfig.generateChallenge(user, TYPE_ENROLL, 15);
    }

    /** Resuelve un token de desafío del tipo esperado a su usuario (activo, de plataforma). */
    public User userFromChallenge(String challengeToken, String expectedType) {
        try {
            if (challengeToken == null || !jwtConfig.isTokenValid(challengeToken)
                    || !expectedType.equals(jwtConfig.extractType(challengeToken))) {
                throw new BadCredentialsException("La verificación expiró. Inicia sesión de nuevo.");
            }
            User u = userRepository.findByEmail(jwtConfig.extractUsername(challengeToken))
                .orElseThrow(() -> new BadCredentialsException("La verificación expiró. Inicia sesión de nuevo."));
            if (!u.getActive()) {
                throw new BadCredentialsException("La verificación expiró. Inicia sesión de nuevo.");
            }
            return u;
        } catch (io.jsonwebtoken.JwtException e) {
            throw new BadCredentialsException("La verificación expiró. Inicia sesión de nuevo.");
        }
    }

    // ───────────────────────── Segundo factor ─────────────────────────

    /** Valida el código TOTP o de respaldo al iniciar sesión. Lanza BadCredentialsException si falla. */
    @Transactional(noRollbackFor = BadCredentialsException.class)
    public void verifySecondFactor(User user, String code) {
        assertNotLocked(user.getMfaLockedUntil(), "verificación");
        String clean = code == null ? "" : code.trim();
        boolean ok = false;
        if (clean.matches("\\d{6}")) {
            long step = totp.matchingStep(crypto.decrypt(user.getMfaSecret()), clean);
            // Un código ya usado (mismo paso o anterior) no vale otra vez
            if (step >= 0 && (user.getMfaLastStep() == null || step > user.getMfaLastStep())) {
                user.setMfaLastStep(step);
                ok = true;
            }
        } else if (!clean.isEmpty()) {
            ok = consumeBackupCode(user, clean);
        }
        if (!ok) {
            registerMfaFailure(user);
            throw new BadCredentialsException("Código incorrecto");
        }
        user.setMfaFailedAttempts(0);
        user.setMfaLockedUntil(null);
        userRepository.save(user);
    }

    public record Enrollment(String secret, String otpauthUri) {}

    /** Genera (y guarda cifrado, aún sin activar) un secreto nuevo para configurar la app. */
    @Transactional
    public Enrollment startEnrollment(User user) {
        if (mfaEnrolled(user)) {
            throw new BadCredentialsException("La verificación en dos pasos ya está configurada");
        }
        String secret = totp.newSecret();
        user.setMfaSecret(crypto.encrypt(secret));
        userRepository.save(user);
        return new Enrollment(secret, totp.otpauthUri(ISSUER, user.getEmail(), secret));
    }

    /**
     * Termina el primer acceso: valida el primer código, fija el PIN (y la contraseña nueva si era
     * temporal) y devuelve los códigos de respaldo (se muestran UNA sola vez).
     */
    @Transactional(noRollbackFor = BadCredentialsException.class)
    public List<String> finishEnrollment(User user, String code, String pin, String newPassword) {
        if (mfaEnrolled(user) || user.getMfaSecret() == null) {
            throw new BadCredentialsException("Inicia la configuración de nuevo");
        }
        assertNotLocked(user.getMfaLockedUntil(), "verificación");
        // El PIN es del equipo de plataforma (confirma acciones sensibles); los usuarios de empresa no lo usan
        if (user.isPlatformUser() && (pin == null || !pin.matches(PIN_REGEX))) {
            throw new IllegalArgumentException(PIN_MSG);
        }
        if (Boolean.TRUE.equals(user.getMustChangePassword())) {
            if (newPassword == null || !newPassword.matches(UserDTO.PASSWORD_REGEX)) {
                throw new IllegalArgumentException(UserDTO.PASSWORD_MSG);
            }
            if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
                throw new IllegalArgumentException("La contraseña nueva debe ser distinta de la temporal");
            }
        }
        long step = totp.matchingStep(crypto.decrypt(user.getMfaSecret()), code == null ? "" : code.trim());
        if (step < 0) {
            registerMfaFailure(user);
            throw new BadCredentialsException("Código incorrecto");
        }
        user.setMfaLastStep(step);
        user.setMfaEnabledAt(LocalDateTime.now());
        user.setMfaFailedAttempts(0);
        user.setMfaLockedUntil(null);
        if (user.isPlatformUser()) {
            user.setPinHash(passwordEncoder.encode(pin));
            user.setPinFailedAttempts(0);
            user.setPinLockedUntil(null);
        }
        if (Boolean.TRUE.equals(user.getMustChangePassword())) {
            user.setPasswordHash(passwordEncoder.encode(newPassword));
            user.setMustChangePassword(false);
        }
        userRepository.save(user);
        return regenerateBackupCodes(user);
    }

    // ───────────────────────── PIN ─────────────────────────

    /** Confirma una acción sensible con el PIN del usuario. */
    @Transactional(noRollbackFor = PinException.class)
    public void verifyPin(User user, String pin) {
        if (user.getPinLockedUntil() != null && user.getPinLockedUntil().isAfter(LocalDateTime.now())) {
            throw new PinException("Demasiados intentos fallidos. Espera " + LOCK_MINUTES + " minutos para usar el PIN de nuevo.");
        }
        if (user.getPinHash() == null || pin == null || !passwordEncoder.matches(pin, user.getPinHash())) {
            int attempts = (user.getPinFailedAttempts() == null ? 0 : user.getPinFailedAttempts()) + 1;
            user.setPinFailedAttempts(attempts);
            if (attempts >= MAX_ATTEMPTS) {
                user.setPinLockedUntil(LocalDateTime.now().plusMinutes(LOCK_MINUTES));
                user.setPinFailedAttempts(0);
            }
            userRepository.save(user);
            throw new PinException("PIN incorrecto");
        }
        if (user.getPinFailedAttempts() != 0 || user.getPinLockedUntil() != null) {
            user.setPinFailedAttempts(0);
            user.setPinLockedUntil(null);
            userRepository.save(user);
        }
    }

    // ───────────────────────── Auxiliares ─────────────────────────

    /** Borra el segundo factor y el PIN de un usuario (reinicio de acceso): deberá configurarlos de nuevo. */
    @Transactional
    public void resetFactors(User user) {
        user.setMfaSecret(null);
        user.setMfaEnabledAt(null);
        user.setMfaLastStep(null);
        user.setMfaFailedAttempts(0);
        user.setMfaLockedUntil(null);
        user.setPinHash(null);
        user.setPinFailedAttempts(0);
        user.setPinLockedUntil(null);
        backupCodeRepository.deleteByUserId(user.getId());
    }

    private List<String> regenerateBackupCodes(User user) {
        backupCodeRepository.deleteByUserId(user.getId());
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            String c = randomBackup();
            codes.add(c);
            backupCodeRepository.save(PlatformBackupCode.builder().userId(user.getId()).codeHash(hash(c)).build());
        }
        return codes;
    }

    private boolean consumeBackupCode(User user, String code) {
        String normalized = code.replace("-", "").toUpperCase();
        return backupCodeRepository.findByUserIdAndCodeHashAndUsedAtIsNull(user.getId(), hash(normalized))
            .map(c -> {
                c.setUsedAt(LocalDateTime.now());
                backupCodeRepository.save(c);
                return true;
            }).orElse(false);
    }

    private String randomBackup() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(BACKUP_ALPHABET.charAt(random.nextInt(BACKUP_ALPHABET.length())));
        return sb.toString();
    }

    private void registerMfaFailure(User user) {
        int attempts = (user.getMfaFailedAttempts() == null ? 0 : user.getMfaFailedAttempts()) + 1;
        user.setMfaFailedAttempts(attempts);
        if (attempts >= MAX_ATTEMPTS) {
            user.setMfaLockedUntil(LocalDateTime.now().plusMinutes(LOCK_MINUTES));
            user.setMfaFailedAttempts(0);
        }
        userRepository.save(user);
    }

    private void assertNotLocked(LocalDateTime lockedUntil, String what) {
        if (lockedUntil != null && lockedUntil.isAfter(LocalDateTime.now())) {
            throw new BadCredentialsException("Demasiados intentos fallidos. Espera " + LOCK_MINUTES
                + " minutos para intentar la " + what + " de nuevo.");
        }
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
