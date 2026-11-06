package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * MfaSelfController — Verificación en dos pasos de los usuarios de EMPRESA (ADMIN y SELLER), desde su perfil.
 *
 * GET  /auth/mfa/self/status        → { enabled, requiredByCompany, canDisable, backupCodesLeft }
 * POST /auth/mfa/self/setup/start   → { password } → { secret, otpauthUri }
 * POST /auth/mfa/self/setup/finish  → { code }     → { backupCodes }  (se muestran una sola vez)
 * POST /auth/mfa/self/disable       → { password, code }  (no si la empresa la exige)
 *
 * Activar y desactivar piden la contraseña actual (y desactivar, además un código): robar una sesión
 * abierta no basta para quitar la protección. El equipo de plataforma no usa estas rutas.
 */
@RestController
@RequestMapping("/auth/mfa/self")
@RequiredArgsConstructor
public class MfaSelfController {

    public record PasswordBody(@NotBlank @Size(max = 72) String password) {}
    public record CodeBody(@NotBlank @Size(max = 20) String code) {}
    public record DisableBody(@NotBlank @Size(max = 72) String password, @NotBlank @Size(max = 20) String code) {}

    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;
    private final PasswordEncoder passwordEncoder;
    private final PlatformSecurityService security;
    private final AuditService auditService;

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(Authentication auth) {
        User u = current(auth);
        boolean required = requiredByCompany(u);
        return ResponseEntity.ok(Map.of(
            "enabled", security.mfaEnrolled(u),
            "requiredByCompany", required,
            "canDisable", security.mfaEnrolled(u) && !required,
            "backupCodesLeft", security.backupCodesLeft(u)));
    }

    @PostMapping("/setup/start")
    public ResponseEntity<Map<String, String>> start(@Valid @RequestBody PasswordBody body, Authentication auth) {
        User u = current(auth);
        checkPassword(u, body.password());
        var e = security.startEnrollment(u);   // 401 si ya está configurada
        return ResponseEntity.ok(Map.of("secret", e.secret(), "otpauthUri", e.otpauthUri()));
    }

    @PostMapping("/setup/finish")
    public ResponseEntity<Map<String, List<String>>> finish(@Valid @RequestBody CodeBody body, Authentication auth) {
        User u = current(auth);
        List<String> backup = security.finishEnrollment(u, body.code(), null, null);
        auditService.record(u.getEmail(), "MFA_ENABLED", u.getOrganizationId(), null);
        return ResponseEntity.ok(Map.of("backupCodes", backup));
    }

    @PostMapping("/disable")
    public ResponseEntity<Map<String, String>> disable(@Valid @RequestBody DisableBody body, Authentication auth) {
        User u = current(auth);
        if (requiredByCompany(u)) {
            throw new IllegalStateException("Tu empresa exige la verificación en dos pasos: no se puede desactivar");
        }
        if (!security.mfaEnrolled(u)) {
            throw new IllegalStateException("La verificación en dos pasos no está activada");
        }
        checkPassword(u, body.password());
        security.verifySecondFactor(u, body.code());
        security.resetFactors(u);
        userRepository.save(u);
        auditService.record(u.getEmail(), "MFA_DISABLED", u.getOrganizationId(), null);
        return ResponseEntity.ok(Map.of("message", "Verificación en dos pasos desactivada"));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private User current(Authentication auth) {
        return userRepository.findByEmail(auth.getName())
            .orElseThrow(() -> new BadCredentialsException("Sesión no válida"));
    }

    private boolean requiredByCompany(User u) {
        if (u.getOrganizationId() == null) return true;
        return organizationRepository.findById(u.getOrganizationId())
            .map(Organization::getRequireMfa).map(Boolean.TRUE::equals).orElse(false);
    }

    /** Contraseña incorrecta → 400 (no 401: la sesión sigue vigente). */
    private void checkPassword(User u, String password) {
        if (!passwordEncoder.matches(password, u.getPasswordHash())) {
            throw new IllegalArgumentException("La contraseña no es correcta");
        }
    }
}
