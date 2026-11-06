package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Subscription — Suscripción de una empresa a un plan.
 *
 * Estados: TRIAL (prueba) · ACTIVE (al día) · GRACE (venció: solo lectura) ·
 * SUSPENDED (sin acceso, datos conservados) · CANCELLED.
 * No usa @TenantId: la tarea diaria y el panel de plataforma operan entre empresas.
 */
@Entity
@Table(name = "subscriptions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id", nullable = false, unique = true, updatable = false)
    private Long organizationId;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false, length = 10)
    @Builder.Default
    private BillingCycle billingCycle = BillingCycle.MONTHLY;

    /** Cortesía/interna: acceso completo sin cobro. */
    @Column(nullable = false)
    @Builder.Default
    private Boolean complimentary = false;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "grace_ends_at")
    private LocalDateTime graceEndsAt;

    @Column(name = "suspended_at")
    private LocalDateTime suspendedAt;

    @Column(name = "reminder_5d_sent_at")
    private LocalDateTime reminder5dSentAt;

    @Column(name = "reminder_1d_sent_at")
    private LocalDateTime reminder1dSentAt;

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

    public enum Status { TRIAL, ACTIVE, GRACE, SUSPENDED, CANCELLED }

    public enum BillingCycle { MONTHLY, YEARLY }
}
