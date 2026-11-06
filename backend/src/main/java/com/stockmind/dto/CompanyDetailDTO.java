package com.stockmind.dto;

import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/** Ficha de una empresa en el panel de plataforma. Nunca incluye datos de negocio (productos, ventas, clientes). */
public class CompanyDetailDTO {

    public record UserRow(Long id, String username, String email, String role, boolean active,
                          boolean mfaEnabled, LocalDateTime createdAt) {
        public static UserRow of(User u) {
            return new UserRow(u.getId(), u.getUsername(), u.getEmail(), u.getRole().name(),
                Boolean.TRUE.equals(u.getActive()), u.getMfaEnabledAt() != null, u.getCreatedAt());
        }
    }

    /** Cobro sin la referencia del enlace de pago (es un secreto de quien paga). */
    public record PaymentRow(Long id, String planCode, String planName, String billingCycle, String provider,
                             long amountNet, long ivaAmount, long amountTotal, String status,
                             boolean createdByPlatform, LocalDateTime createdAt, LocalDateTime paidAt) {
        public static PaymentRow of(Payment p, LocalDateTime now) {
            // Un enlace sin pagar que ya venció se muestra como vencido (la base no lo actualiza sola)
            String status = p.getStatus() == Payment.Status.PENDING && p.getExpiresAt().isBefore(now)
                ? Payment.Status.EXPIRED.name() : p.getStatus().name();
            return new PaymentRow(p.getId(), p.getPlan().getCode(), p.getPlan().getName(), p.getBillingCycle().name(),
                p.getProvider(), p.getAmountNet(), p.getIvaAmount(), p.getAmountTotal(), status,
                Boolean.TRUE.equals(p.getCreatedByPlatform()), p.getCreatedAt(), p.getPaidAt());
        }
    }

    /** Evento de la línea de tiempo: type = ORGANIZATION | AUDIT | PAYMENT. */
    public record TimelineEvent(LocalDateTime at, String type, String title, String actor, String details) {}

    public record Detail(PlatformDTO.OrganizationView organization,
                         boolean requireMfa, LocalDateTime termsAcceptedAt, String termsVersion,
                         BillingDTO.SubscriptionView plan,
                         List<UserRow> users,
                         boolean paymentsVisible, List<PaymentRow> payments,
                         List<TimelineEvent> timeline) {
        public static Detail of(Organization o, PlatformDTO.OrganizationView view, BillingDTO.SubscriptionView plan,
                                List<UserRow> users, boolean paymentsVisible, List<PaymentRow> payments,
                                List<TimelineEvent> timeline) {
            return new Detail(view, Boolean.TRUE.equals(o.getRequireMfa()), o.getTermsAcceptedAt(),
                o.getTermsVersion(), plan, users, paymentsVisible, payments, timeline);
        }
    }

    /** Corrección de datos de contacto: solo se cambia lo que llegue. */
    @Data
    public static class ContactUpdate {
        @Size(min = 2, max = 150, message = "El nombre de la empresa debe tener entre 2 y 150 caracteres")
        private String name;

        @Size(max = 200, message = "La razón social no puede superar 200 caracteres")
        private String legalName;

        @Pattern(regexp = "^[0-9+()\\-\\s]{7,20}$", message = "El teléfono no es válido")
        private String phone;

        @Email(message = "El correo de contacto no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String contactEmail;

        @Pattern(regexp = "^[A-Za-z]{2}$", message = "El país debe ser un código de 2 letras (ej. CO)")
        private String country;
    }

    /** Cambio de NIT: operación sensible (solo el dueño, con su PIN). */
    @Data
    public static class TaxIdUpdate {
        @jakarta.validation.constraints.NotBlank(message = "El NIT es obligatorio")
        @Pattern(regexp = "^[A-Za-z0-9.\\-]{5,20}$",
                 message = "El NIT debe tener entre 5 y 20 caracteres (letras, números, punto o guion)")
        private String taxId;

        @jakarta.validation.constraints.NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;
    }
}
