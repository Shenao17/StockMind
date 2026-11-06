package com.stockmind.billing;

import com.stockmind.exception.BillingException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription.BillingCycle;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * PaymentService — Cobros de planes.
 *
 * Flujo: createCheckout (PENDING + URL de pago) → la pasarela confirma → markPaid (activa el plan).
 * markPaid es idempotente: un webhook repetido no extiende el plan dos veces.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final PaymentRepository paymentRepository;
    private final OrganizationRepository organizationRepository;
    private final SubscriptionService subscriptionService;
    private final Optional<PaymentProvider> provider;

    @Value("${stockmind.billing.iva-rate:0.19}")
    private double ivaRate;

    @Value("${stockmind.billing.payment-link-hours:48}")
    private int linkHours;

    // ───────────────────────────── Creación ─────────────────────────────

    /** Crea un cobro pendiente y devuelve el pago con su referencia. La URL la arma checkoutUrl(). */
    @Transactional
    public Payment createCheckout(Long organizationId, String planCode, BillingCycle cycle, boolean byPlatform) {
        PaymentProvider p = provider.orElseThrow(() -> new BillingException(HttpStatus.SERVICE_UNAVAILABLE,
            "PAYMENTS_UNAVAILABLE", "Los pagos no están disponibles en este momento"));
        Plan plan = subscriptionService.planByCode(planCode);
        BillingCycle c = cycle == null ? BillingCycle.MONTHLY : cycle;
        return paymentRepository.save(build(organizationId, plan, c, p.name(), byPlatform, Payment.Status.PENDING));
    }

    /** Pago confirmado por fuera del sistema (p. ej. acordado por teléfono): activa el plan de inmediato. */
    @Transactional
    public Payment recordManualPayment(Long organizationId, String planCode, BillingCycle cycle) {
        Plan plan = subscriptionService.planByCode(planCode);
        BillingCycle c = cycle == null ? BillingCycle.MONTHLY : cycle;
        Payment payment = build(organizationId, plan, c, "MANUAL", true, Payment.Status.PAID);
        payment.setPaidAt(LocalDateTime.now());
        payment = paymentRepository.save(payment);
        subscriptionService.activate(organizationId, plan, c, payment.getPaidAt());
        return payment;
    }

    public String checkoutUrl(Payment payment) {
        return provider.orElseThrow(() -> new BillingException(HttpStatus.SERVICE_UNAVAILABLE,
            "PAYMENTS_UNAVAILABLE", "Los pagos no están disponibles en este momento")).checkoutUrl(payment);
    }

    // ───────────────────────────── Confirmación ─────────────────────────────

    /** Confirma el pago (webhook de la pasarela o simulador). Idempotente. */
    @Transactional
    public Payment markPaid(String reference) {
        Payment payment = paymentRepository.findByReference(reference)
            .orElseThrow(() -> new ResourceNotFoundException("Pago no encontrado"));
        if (payment.getStatus() == Payment.Status.PAID) {
            return payment;
        }
        if (payment.getStatus() != Payment.Status.PENDING || payment.getExpiresAt().isBefore(LocalDateTime.now())) {
            // La caducidad se deriva de expires_at (ver BillingDTO.PaymentView): no se guarda aquí
            // porque la excepción revierte la transacción.
            throw new IllegalStateException("El enlace de pago venció. Solicita uno nuevo.");
        }
        payment.setStatus(Payment.Status.PAID);
        payment.setPaidAt(LocalDateTime.now());
        paymentRepository.save(payment);
        subscriptionService.activate(payment.getOrganizationId(), payment.getPlan(),
            payment.getBillingCycle(), payment.getPaidAt());
        log.info("Pago {} confirmado para la empresa {}", payment.getId(), payment.getOrganizationId());
        return payment;
    }

    /** Solo el simulador permite confirmar un pago sin pasarela. */
    @Transactional
    public Payment simulatePaid(String reference) {
        if (provider.map(PaymentProvider::allowsSimulation).orElse(false)) {
            return markPaid(reference);
        }
        throw new ResourceNotFoundException("Recurso no encontrado");
    }

    // ───────────────────────────── Consultas ─────────────────────────────

    public Payment byReference(String reference) {
        return paymentRepository.findByReference(reference)
            .orElseThrow(() -> new ResourceNotFoundException("Pago no encontrado"));
    }

    public boolean simulationAllowed() {
        return provider.map(PaymentProvider::allowsSimulation).orElse(false);
    }

    public List<Payment> history(Long organizationId) {
        return paymentRepository.findByOrganizationIdOrderByCreatedAtDesc(organizationId);
    }

    public String companyName(Long organizationId) {
        return organizationRepository.findById(organizationId).map(Organization::getName).orElse("");
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private Payment build(Long orgId, Plan plan, BillingCycle cycle, String providerName,
                          boolean byPlatform, Payment.Status status) {
        long net = cycle == BillingCycle.YEARLY ? plan.getPriceYearly() : plan.getPriceMonthly();
        long iva = Math.round(net * ivaRate);
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Payment.builder()
            .organizationId(orgId).plan(plan).billingCycle(cycle)
            .reference(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes))
            .provider(providerName)
            .amountNet(net).ivaAmount(iva).amountTotal(net + iva)
            .status(status).createdByPlatform(byPlatform)
            .expiresAt(LocalDateTime.now().plusHours(linkHours))
            .build();
    }
}
