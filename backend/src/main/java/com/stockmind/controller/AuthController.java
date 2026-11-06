package com.stockmind.controller;

import com.stockmind.dto.LoginRequest;
import com.stockmind.dto.LoginResponse;
import com.stockmind.repository.UserRepository;
import com.stockmind.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * AuthController — Endpoints de autenticación
 *
 * GET  /auth/me     -> Retorna perfil del usuario autenticado
 * POST /auth/login  -> Autentica y retorna JWT
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            LoginResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    // ── Verificación en dos pasos del equipo de plataforma (se llama con el token de desafío) ──

    public record MfaVerifyRequest(@jakarta.validation.constraints.NotBlank String challengeToken,
                                   @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 20) String code) {}
    public record EnrollStartRequest(@jakarta.validation.constraints.NotBlank String challengeToken) {}
    public record EnrollFinishRequest(@jakarta.validation.constraints.NotBlank String challengeToken,
                                      @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 20) String code,
                                      @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 20) String pin,
                                      @jakarta.validation.constraints.Size(max = 72) String newPassword) {}

    @PostMapping("/mfa/verify")
    public ResponseEntity<?> mfaVerify(@Valid @RequestBody MfaVerifyRequest body) {
        try {
            return ResponseEntity.ok(authService.verifyMfa(body.challengeToken(), body.code()));
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/mfa/enroll/start")
    public ResponseEntity<?> enrollStart(@Valid @RequestBody EnrollStartRequest body) {
        try {
            var e = authService.startEnrollment(body.challengeToken());
            return ResponseEntity.ok(Map.of("secret", e.secret(), "otpauthUri", e.otpauthUri()));
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/mfa/enroll/finish")
    public ResponseEntity<?> enrollFinish(@Valid @RequestBody EnrollFinishRequest body) {
        try {
            return ResponseEntity.ok(authService.finishEnrollment(
                body.challengeToken(), body.code(), body.pin(), body.newPassword()));
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        String username = authentication.getName();
        return userRepository.findByEmail(username)
            .map(user -> ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "email", user.getEmail(),
                "role", user.getRole().name(),
                "organizationId", user.getOrganizationId() == null ? 0L : user.getOrganizationId(),
                "fullName", user.getFullName() == null ? "" : user.getFullName(),
                "permissions", com.stockmind.platform.PlatformPermission.of(user.getRole()).stream()
                    .map(Enum::name).sorted().toList()
            )))
            .orElse(ResponseEntity.notFound().build());
    }
}
