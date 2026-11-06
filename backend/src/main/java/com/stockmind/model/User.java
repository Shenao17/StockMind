package com.stockmind.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import com.fasterxml.jackson.annotation.JsonIgnore;

import java.time.LocalDateTime;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(name = "uk_users_org_username", columnNames = {"organization_id", "username"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Empresa del usuario. NULL solo para el equipo de plataforma (PLATFORM_*).
     * Los usuarios NO usan @TenantId porque el login debe poder buscarlos por correo
     * antes de conocer la empresa; el aislamiento de usuarios se aplica en UserController.
     */
    @Column(name = "organization_id")
    private Long organizationId;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @JsonIgnore
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    /** Cuándo confirmó su correo; null = pendiente de verificar. */
    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    /** Nombre real (equipo de plataforma). */
    @Column(name = "full_name", length = 100)
    private String fullName;

    // ── Verificación en dos pasos (solo equipo de plataforma) ──
    @JsonIgnore
    @Column(name = "mfa_secret")
    private String mfaSecret;                 // cifrado con AES-GCM

    @Column(name = "mfa_enabled_at")
    private LocalDateTime mfaEnabledAt;       // null = pendiente de configurar

    @Column(name = "mfa_last_step")
    private Long mfaLastStep;

    @Column(name = "mfa_failed_attempts", nullable = false)
    @Builder.Default
    private Integer mfaFailedAttempts = 0;

    @Column(name = "mfa_locked_until")
    private LocalDateTime mfaLockedUntil;

    @JsonIgnore
    @Column(name = "pin_hash")
    private String pinHash;

    @Column(name = "pin_failed_attempts", nullable = false)
    @Builder.Default
    private Integer pinFailedAttempts = 0;

    @Column(name = "pin_locked_until")
    private LocalDateTime pinLockedUntil;

    @Column(name = "must_change_password", nullable = false)
    @Builder.Default
    private Boolean mustChangePassword = false;

    /** Las sesiones emitidas antes de esta fecha dejan de valer (cambio de rol, reinicio de acceso). */
    @Column(name = "sessions_valid_from")
    private LocalDateTime sessionsValidFrom;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public enum Role {
        PLATFORM_OWNER,   // dueño de la plataforma: todo
        PLATFORM_BILLING, // cobranza: empresas, enlaces de pago
        PLATFORM_SUPPORT, // soporte técnico: consulta y acciones no sensibles
        PLATFORM_VIEWER,  // solo lectura
        ADMIN,            // administrador de UNA empresa
        SELLER;           // vendedor de una empresa

        /** Roles del equipo de plataforma: no pertenecen a ninguna empresa. */
        public boolean isPlatform() {
            return name().startsWith("PLATFORM_");
        }
    }

    public boolean isPlatformUser() {
        return role != null && role.isPlatform();
    }
}