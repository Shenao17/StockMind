package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** AuditLog — Registro de acciones sensibles (quién hizo qué, sobre qué empresa y cuándo). */
@Entity
@Table(name = "audit_log")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_email", nullable = false, length = 100)
    private String actorEmail;

    @Column(nullable = false, length = 50)
    private String action;

    @Column(name = "organization_id")
    private Long organizationId;

    @Column(length = 500)
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
