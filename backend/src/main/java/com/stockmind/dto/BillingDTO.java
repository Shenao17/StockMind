package com.stockmind.dto;

import com.stockmind.model.Payment;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/** Vistas y solicitudes de facturación (planes, suscripción, pagos). Montos en COP. */
public class BillingDTO {

    public record PlanView(String code, String name, long priceMonthly, long ivaMonthly, long totalMonthly,
                           long priceYearly, long ivaYearly, long totalYearly,
                           int maxUsers, int maxProducts, long extraUserPrice, List<String> features) {
        public static PlanView of(Plan p, double ivaRate) {
            long ivaM = Math.round(p.getPriceMonthly() * ivaRate);
            long ivaY = Math.round(p.getPriceYearly() * ivaRate);
            return new PlanView(p.getCode(), p.getName(),
                p.getPriceMonthly(), ivaM, p.getPriceMonthly() + ivaM,
                p.getPriceYearly(), ivaY, p.getPriceYearly() + ivaY,
                p.getMaxUsers(), p.getMaxProducts(), p.getExtraUserPrice(),
                p.getFeatures().stream().sorted().toList());
        }
    }

    public record Usage(long users, long products) {}

    public record SubscriptionView(String planCode, String planName, Subscription.Status status,
                                   Subscription.BillingCycle billingCycle, boolean complimentary,
                                   LocalDateTime trialEndsAt, Long trialDaysLeft,
                                   LocalDateTime currentPeriodEnd, LocalDateTime graceEndsAt,
                                   boolean readOnly, boolean blocked,
                                   List<String> features, int maxUsers, int maxProducts, Usage usage) {}

    /** Resumen de una suscripción para el panel de plataforma. */
    public record SubscriptionSummary(String planCode, String planName, Subscription.Status status,
                                      Subscription.BillingCycle billingCycle, boolean complimentary,
                                      LocalDateTime trialEndsAt, LocalDateTime currentPeriodEnd,
                                      LocalDateTime graceEndsAt) {
        public static SubscriptionSummary of(Subscription s) {
            return new SubscriptionSummary(s.getPlan().getCode(), s.getPlan().getName(), s.getStatus(),
                s.getBillingCycle(), Boolean.TRUE.equals(s.getComplimentary()), s.getTrialEndsAt(),
                s.getCurrentPeriodEnd(), s.getGraceEndsAt());
        }
    }

    public record PaymentView(String reference, String status, String planCode, String planName,
                              Subscription.BillingCycle billingCycle, long amountNet, long ivaAmount,
                              long amountTotal, String provider, LocalDateTime expiresAt,
                              LocalDateTime paidAt, String checkoutUrl, boolean canSimulate, String company) {
        public static PaymentView of(Payment p, String checkoutUrl, boolean canSimulate, String company) {
            boolean expired = p.getStatus() == Payment.Status.PENDING && p.getExpiresAt().isBefore(LocalDateTime.now());
            return new PaymentView(p.getReference(), expired ? "EXPIRED" : p.getStatus().name(), p.getPlan().getCode(),
                p.getPlan().getName(), p.getBillingCycle(), p.getAmountNet(), p.getIvaAmount(),
                p.getAmountTotal(), p.getProvider(), p.getExpiresAt(), p.getPaidAt(), checkoutUrl,
                canSimulate && !expired, company);
        }
    }

    @Data
    public static class CheckoutRequest {
        @NotBlank(message = "El plan es obligatorio")
        @Size(max = 20)
        private String planCode;

        private Subscription.BillingCycle billingCycle = Subscription.BillingCycle.MONTHLY;
    }
}
