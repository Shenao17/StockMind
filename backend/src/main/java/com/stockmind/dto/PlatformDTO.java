package com.stockmind.dto;

import com.stockmind.model.Organization;
import com.stockmind.model.Subscription;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/** Vistas y solicitudes del panel de plataforma. */
public class PlatformDTO {

    public record OrganizationView(Long id, String name, String legalName, String taxId, String contactEmail,
                                   String phone, String country, Organization.Status status,
                                   Organization.Origin origin, LocalDateTime createdAt,
                                   BillingDTO.SubscriptionSummary subscription) {
        public static OrganizationView of(Organization o, Subscription s) {
            return new OrganizationView(o.getId(), o.getName(), o.getLegalName(), o.getTaxId(),
                o.getContactEmail(), o.getPhone(), o.getCountry(), o.getStatus(), o.getOrigin(),
                o.getCreatedAt(), s == null ? null : BillingDTO.SubscriptionSummary.of(s));
        }
    }

    @Data
    public static class ExtendTrial {
        @NotNull(message = "Indica cuántos días")
        @Min(value = 1, message = "Mínimo 1 día")
        @Max(value = 90, message = "Máximo 90 días")
        private Integer days;
    }

    @Data
    public static class PlanChange {
        @NotBlank(message = "El plan es obligatorio")
        @Size(max = 20)
        private String planCode;
        private Subscription.BillingCycle billingCycle;
        private Boolean complimentary;
    }

    @Data
    public static class PaymentLink {
        @NotBlank(message = "El plan es obligatorio")
        @Size(max = 20)
        private String planCode;
        private Subscription.BillingCycle billingCycle = Subscription.BillingCycle.MONTHLY;
    }
}
