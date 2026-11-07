package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Solicitud de una acción sensible sobre una empresa, pendiente de aprobación del dueño de la plataforma. */
@Entity
@Table(name = "platform_requests")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlatformRequest {

    public enum Type { SUSPEND, CANCEL, CHANGE_PLAN, MANUAL_PAYMENT, EXTEND_TRIAL, CHANGE_TAX_ID }

    public enum Status { PENDING, APPROVED, REJECTED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Type type;

    @Column(name = "organization_id", nullable = false, updatable = false)
    private Long organizationId;

    /** JSON con los parámetros de la acción. Nunca contiene secretos. */
    @Column(length = 1000)
    private String params;

    @Column(nullable = false, length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "requested_by", nullable = false, length = 100, updatable = false)
    private String requestedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "decided_by", length = 100)
    private String decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "decision_note", length = 500)
    private String decisionNote;
}
