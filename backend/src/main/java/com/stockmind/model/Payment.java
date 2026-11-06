package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Payment — Cobro de un plan. Montos en COP: neto (sin IVA), IVA y total. */
@Entity
@Table(name = "payments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organization_id", nullable = false, updatable = false)
    private Long organizationId;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private Plan plan;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false, length = 10)
    private Subscription.BillingCycle billingCycle;

    /** Identificador impredecible del enlace de pago. */
    @Column(nullable = false, unique = true, length = 64)
    private String reference;

    @Column(nullable = false, length = 20)
    private String provider;

    @Column(name = "amount_net", nullable = false)
    private Long amountNet;

    @Column(name = "iva_amount", nullable = false)
    private Long ivaAmount;

    @Column(name = "amount_total", nullable = false)
    private Long amountTotal;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "created_by_platform", nullable = false)
    @Builder.Default
    private Boolean createdByPlatform = false;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum Status { PENDING, PAID, FAILED, EXPIRED }
}
