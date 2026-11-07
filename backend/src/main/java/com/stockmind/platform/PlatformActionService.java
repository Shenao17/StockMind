package com.stockmind.platform;

import com.stockmind.billing.AuditService;
import com.stockmind.billing.PaymentService;
import com.stockmind.billing.SubscriptionService;
import com.stockmind.exception.ConflictException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.service.RegistrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * PlatformActionService — Las acciones sensibles sobre una empresa, en un solo lugar.
 *
 * Las usan dos caminos: el Dueño directamente (PlatformController, PlatformDetailController) y la
 * aprobación de una solicitud del equipo (PlatformRequestService). Cada acción queda en la auditoría
 * con quién la ejecutó y, si vino de una solicitud, quién la pidió (parámetro `via`).
 */
@Service
@RequiredArgsConstructor
public class PlatformActionService {

    private final OrganizationRepository organizationRepository;
    private final SubscriptionService subscriptionService;
    private final PaymentService paymentService;
    private final AuditService auditService;

    @Transactional
    public void suspend(Long orgId, String actor, String via) {
        find(orgId);
        subscriptionService.suspend(orgId);
        auditService.record(actor, "ORGANIZATION_SUSPENDED", orgId, via);
    }

    @Transactional
    public void cancel(Long orgId, String actor, String via) {
        find(orgId);
        subscriptionService.cancel(orgId);
        auditService.record(actor, "ORGANIZATION_CANCELLED", orgId, via);
    }

    @Transactional
    public void extendTrial(Long orgId, int days, String actor, String via) {
        find(orgId);
        subscriptionService.extendTrial(orgId, days);
        auditService.record(actor, "TRIAL_EXTENDED", orgId, join("días=" + days, via));
    }

    @Transactional
    public Plan changePlan(Long orgId, String planCode, Subscription.BillingCycle cycle, Boolean complimentary, String actor, String via) {
        find(orgId);
        Plan plan = subscriptionService.planByCode(planCode);
        subscriptionService.changePlan(orgId, plan, cycle, complimentary);
        auditService.record(actor, "PLAN_CHANGED", orgId, join("plan=" + plan.getCode() + " cortesía=" + complimentary, via));
        return plan;
    }

    @Transactional
    public Payment manualPayment(Long orgId, String planCode, Subscription.BillingCycle cycle, String actor, String via) {
        find(orgId);
        Payment payment = paymentService.recordManualPayment(orgId, planCode, cycle);
        auditService.record(actor, "MANUAL_PAYMENT_RECORDED", orgId, join("plan=" + planCode + " total=" + payment.getAmountTotal(), via));
        return payment;
    }

    @Transactional
    public void changeTaxId(Long orgId, String rawTaxId, String actor, String via) {
        Organization org = find(orgId);
        String taxId = RegistrationService.normalizeTaxId(rawTaxId);
        if (taxId.equals(org.getTaxId())) {
            throw new IllegalArgumentException("El NIT es el mismo que ya tiene la empresa");
        }
        if (organizationRepository.existsByTaxId(taxId)) {
            throw new ConflictException("Ya existe una empresa con el NIT " + taxId);
        }
        String before = org.getTaxId();
        org.setTaxId(taxId);
        organizationRepository.save(org);
        auditService.record(actor, "ORGANIZATION_TAX_ID_UPDATED", orgId,
            join((before == null || before.isBlank() ? "—" : before) + " → " + taxId, via));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private Organization find(Long id) {
        return organizationRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
    }

    private static String join(String detail, String via) {
        List<String> parts = new ArrayList<>();
        parts.add(detail);
        if (via != null && !via.isBlank()) parts.add(via);
        return String.join(" · ", parts);
    }
}
