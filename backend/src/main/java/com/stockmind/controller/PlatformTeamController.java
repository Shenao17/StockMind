package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.dto.TeamDTO;
import com.stockmind.exception.ConflictException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

/**
 * PlatformTeamController — Gestión del equipo de plataforma (solo el dueño: permiso TEAM_MANAGE).
 *
 * GET   /platform/team                       → miembros
 * POST  /platform/team                       → alta (contraseña temporal; primer acceso obligatorio)
 * PATCH /platform/team/{id}                  → cambiar rol, nombre o activar/desactivar
 * POST  /platform/team/{id}/reset-access     → nueva contraseña temporal y borra 2FA y PIN
 *
 * Cada mutación exige el PIN del dueño y queda en la auditoría. Nadie (ni el dueño) cambia su propio
 * rol ni se desactiva, y no se crean otros dueños desde aquí.
 */
@RestController
@RequestMapping("/platform/team")
@RequiredArgsConstructor
public class PlatformTeamController {

    private static final String PASSWORD_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PlatformSecurityService security;
    private final AuditService auditService;
    private final SecureRandom random = new SecureRandom();

    @GetMapping
    public ResponseEntity<List<TeamDTO.Member>> list() {
        return ResponseEntity.ok(userRepository.findAll().stream()
            .filter(User::isPlatformUser)
            .sorted(java.util.Comparator.comparing(User::getId))
            .map(TeamDTO.Member::of).toList());
    }

    @PostMapping
    public ResponseEntity<TeamDTO.Created> create(@Valid @RequestBody TeamDTO.Create body, Authentication auth) {
        User actor = confirm(auth, body.getPin());
        if (!body.getRole().isPlatform() || body.getRole() == User.Role.PLATFORM_OWNER) {
            throw new IllegalArgumentException("El rol debe ser Cobranza, Soporte o Consulta");
        }
        String email = body.getEmail().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("Ese correo ya está registrado en la plataforma");
        }
        String temp = temporaryPassword();
        User u = userRepository.save(User.builder()
            .organizationId(null)
            .username(email)
            .email(email)
            .fullName(body.getFullName().trim())
            .passwordHash(passwordEncoder.encode(temp))
            .role(body.getRole())
            .active(true)
            .mustChangePassword(true)
            .emailVerifiedAt(LocalDateTime.now())
            .build());
        auditService.record(actor.getEmail(), "TEAM_MEMBER_CREATED", null, email + " rol=" + u.getRole());
        return ResponseEntity.status(HttpStatus.CREATED).body(new TeamDTO.Created(TeamDTO.Member.of(u), temp));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<TeamDTO.Member> update(@PathVariable Long id, @Valid @RequestBody TeamDTO.Update body,
                                                 Authentication auth) {
        User actor = confirm(auth, body.getPin());
        User target = target(id, actor);
        StringBuilder changes = new StringBuilder();
        boolean revokeSessions = false;
        if (body.getRole() != null && body.getRole() != target.getRole()) {
            if (!body.getRole().isPlatform() || body.getRole() == User.Role.PLATFORM_OWNER) {
                throw new IllegalArgumentException("El rol debe ser Cobranza, Soporte o Consulta");
            }
            changes.append("rol ").append(target.getRole()).append("→").append(body.getRole()).append(' ');
            target.setRole(body.getRole());
            revokeSessions = true;
        }
        if (body.getActive() != null && !body.getActive().equals(target.getActive())) {
            changes.append(body.getActive() ? "activado " : "desactivado ");
            target.setActive(body.getActive());
            revokeSessions = true;
        }
        if (body.getFullName() != null && !body.getFullName().isBlank()) {
            target.setFullName(body.getFullName().trim());
            changes.append("nombre ");
        }
        if (revokeSessions) target.setSessionsValidFrom(LocalDateTime.now().withNano(0));
        userRepository.save(target);
        auditService.record(actor.getEmail(), "TEAM_MEMBER_UPDATED", null, target.getEmail() + ": " + changes.toString().trim());
        return ResponseEntity.ok(TeamDTO.Member.of(target));
    }

    @PostMapping("/{id}/reset-access")
    public ResponseEntity<TeamDTO.Created> resetAccess(@PathVariable Long id, @Valid @RequestBody TeamDTO.Confirm body,
                                                       Authentication auth) {
        User actor = confirm(auth, body.getPin());
        User target = target(id, actor);
        String temp = temporaryPassword();
        security.resetFactors(target);
        target.setPasswordHash(passwordEncoder.encode(temp));
        target.setMustChangePassword(true);
        target.setSessionsValidFrom(LocalDateTime.now().withNano(0));
        userRepository.save(target);
        auditService.record(actor.getEmail(), "TEAM_ACCESS_RESET", null, target.getEmail());
        return ResponseEntity.ok(new TeamDTO.Created(TeamDTO.Member.of(target), temp));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    /** El dueño que actúa debe confirmar con su PIN (si falla: 401 y cuenta de intentos). */
    private User confirm(Authentication auth, String pin) {
        User actor = userRepository.findByEmail(auth.getName())
            .orElseThrow(() -> new BadCredentialsException("Sesión no válida"));
        security.verifyPin(actor, pin);
        return actor;
    }

    private User target(Long id, User actor) {
        User t = userRepository.findById(id).filter(User::isPlatformUser)
            .orElseThrow(() -> new ResourceNotFoundException("Miembro no encontrado"));
        if (t.getId().equals(actor.getId())) {
            throw new IllegalStateException("No puedes modificar tu propia cuenta desde aquí");
        }
        if (t.getRole() == User.Role.PLATFORM_OWNER) {
            throw new IllegalStateException("La cuenta del dueño no se modifica desde el panel");
        }
        return t;
    }

    private String temporaryPassword() {
        // Letras y números sin caracteres ambiguos; siempre cumple la política (letra + número)
        StringBuilder sb = new StringBuilder("A9");
        for (int i = 0; i < 12; i++) sb.append(PASSWORD_CHARS.charAt(random.nextInt(PASSWORD_CHARS.length())));
        return sb.toString();
    }
}
