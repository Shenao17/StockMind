package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Organization — Empresa cliente de la plataforma (tenant).
 * Es la raíz del aislamiento: todos los datos de negocio cuelgan de una organización.
 */
@Entity
@Table(name = "organizations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Organization {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "legal_name", length = 200)
    private String legalName;

    /** NIT / identificación fiscal (único en la plataforma) */
    @Column(name = "tax_id", unique = true, length = 30)
    private String taxId;

    @Column(name = "contact_email", nullable = false, length = 100)
    private String contactEmail;

    @Column(length = 30)
    private String phone;

    @Builder.Default
    @Column(nullable = false, length = 2, columnDefinition = "CHAR(2)")
    private String country = "CO";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Origin origin;

    /** Fin de la prueba gratis; se fija al verificar el correo en el autoregistro. */
    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    /** El administrador exige la verificación en dos pasos a todos los usuarios de la empresa. */
    @Column(name = "require_mfa", nullable = false)
    @Builder.Default
    private Boolean requireMfa = false;

    @Column(name = "terms_accepted_at")
    private LocalDateTime termsAcceptedAt;

    @Column(name = "terms_version", length = 20)
    private String termsVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public enum Status { PENDING, ACTIVE, SUSPENDED, CANCELLED }

    public enum Origin { SELF_SIGNUP, PLATFORM_ADMIN }
}
