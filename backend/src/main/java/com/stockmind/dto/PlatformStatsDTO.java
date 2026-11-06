package com.stockmind.dto;

import com.stockmind.model.AuditLog;
import com.stockmind.model.Payment;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Vistas del resumen, los cobros y la auditoría del panel de plataforma. Sin datos de negocio de las empresas. */
public class PlatformStatsDTO {

    public record TrialRow(Long organizationId, String name, String planName, LocalDateTime trialEndsAt, long daysLeft) {}

    public record GraceRow(Long organizationId, String name, String planName, LocalDateTime graceEndsAt) {}

    /** Importes en COP: neto (sin IVA), IVA y total cobrado. */
    public record Money(long net, long iva, long total, long count) {}

    /** MRR = ingreso mensual recurrente neto (sin IVA) de las suscripciones activas de pago (anual ÷ 12). */
    public record Revenue(Money thisMonth, Money lastMonth, long mrr, long pendingCount, long pendingTotal, long failedLast30Days) {}

    public record Summary(Map<String, Long> organizations, Map<String, Long> subscriptions, long complimentary,
                          Map<String, Long> plans, long newLast30Days, int trialWarningDays,
                          List<TrialRow> trialsEnding, List<GraceRow> inGrace,
                          Revenue revenue /* null si el rol no puede ver ingresos */) {}

    public record PaymentRow(Long id, Long organizationId, String organizationName, String planCode, String planName,
                             String billingCycle, String provider, long amountNet, long ivaAmount, long amountTotal,
                             String status, boolean createdByPlatform, LocalDateTime createdAt, LocalDateTime paidAt) {
        /** Un enlace sin pagar que ya venció se muestra como vencido. Nunca incluye la referencia del enlace. */
        public static PaymentRow of(Payment p, String organizationName, LocalDateTime now) {
            String status = p.getStatus() == Payment.Status.PENDING && p.getExpiresAt().isBefore(now)
                ? Payment.Status.EXPIRED.name() : p.getStatus().name();
            return new PaymentRow(p.getId(), p.getOrganizationId(), organizationName, p.getPlan().getCode(),
                p.getPlan().getName(), p.getBillingCycle().name(), p.getProvider(), p.getAmountNet(), p.getIvaAmount(),
                p.getAmountTotal(), status, Boolean.TRUE.equals(p.getCreatedByPlatform()), p.getCreatedAt(), p.getPaidAt());
        }
    }

    /** Totales de lo PAGADO dentro del filtro aplicado (todas las páginas, no solo la visible). */
    public record PaymentTotals(long paidNet, long paidIva, long paidTotal, long paidCount) {}

    public record PaymentsPage(PageResponse<PaymentRow> page, PaymentTotals totals) {}

    public record AuditRow(Long id, LocalDateTime at, String action, String actor, Long organizationId,
                           String organizationName, String details) {
        public static AuditRow of(AuditLog a, String organizationName) {
            return new AuditRow(a.getId(), a.getCreatedAt(), a.getAction(), a.getActorEmail(), a.getOrganizationId(),
                organizationName, a.getDetails());
        }
    }
}
