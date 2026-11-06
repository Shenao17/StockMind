package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.billing.PaymentService;
import com.stockmind.billing.SubscriptionService;
import com.stockmind.dto.BillingDTO;
import com.stockmind.dto.PageResponse;
import com.stockmind.dto.PlatformDTO;
import com.stockmind.dto.RegistrationDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.service.RegistrationService;
import com.stockmind.util.Paging;
import jakarta.persistence.criteria.Predicate;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * PlatformController — Operaciones del equipo de plataforma (roles PLATFORM_*, por permiso).
 * Toda acción que cambia algo queda en la auditoría (quién, qué y sobre qué empresa).
 *
 * GET  /platform/organizations                        → lista paginada con su suscripción
 * POST /platform/organizations                        → alta (prueba, pago ya recibido o cortesía)
 * GET  /platform/organizations/{id}
 * POST /platform/organizations/{id}/suspend | reactivate | cancel
 * POST /platform/organizations/{id}/extend-trial      → { days }
 * POST /platform/organizations/{id}/plan              → cambio de plan acordado
 * POST /platform/organizations/{id}/payment-links     → enlace de pago para enviar al cliente
 * POST /platform/organizations/{id}/manual-payment    → registrar un pago recibido por fuera
 */
@RestController
@RequestMapping("/platform")
@RequiredArgsConstructor
public class PlatformController {

    private static final Set<String> SORT_FIELDS = Set.of("id", "name", "status", "createdAt");

    private final RegistrationService registrationService;
    private final OrganizationRepository organizationRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionService subscriptionService;
    private final PaymentService paymentService;
    private final AuditService auditService;

    @PostMapping("/organizations")
    public ResponseEntity<PlatformDTO.OrganizationView> create(
            @Valid @RequestBody RegistrationDTO.ByPlatform body, Authentication auth) {
        Organization org = registrationService.createByPlatform(body);
        auditService.record(auth.getName(), "ORGANIZATION_CREATED", org.getId(),
            "plan=" + body.getPlanCode() + " modo=" + body.getMode());
        return ResponseEntity.status(HttpStatus.CREATED).body(view(org));
    }

    @GetMapping("/organizations")
    public ResponseEntity<PageResponse<PlatformDTO.OrganizationView>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Organization.Status status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String dir) {

        Specification<Organization> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = Paging.likePattern(search);
                ps.add(cb.or(
                    cb.like(cb.lower(root.get("name")), like, '!'),
                    cb.like(cb.lower(root.get("taxId")), like, '!'),
                    cb.like(cb.lower(root.get("contactEmail")), like, '!')));
            }
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        // Listado siempre paginado (puede haber miles de empresas): sin page/size → página 0
        Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS,
            Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<Organization> result = organizationRepository.findAll(spec, pageable);

        Map<Long, Subscription> subs = subscriptionRepository
            .findByOrganizationIdIn(result.getContent().stream().map(Organization::getId).toList())
            .stream().collect(Collectors.toMap(Subscription::getOrganizationId, Function.identity()));
        Page<PlatformDTO.OrganizationView> views = result.map(o -> PlatformDTO.OrganizationView.of(o, subs.get(o.getId())));
        return ResponseEntity.ok(PageResponse.of(views));
    }

    @GetMapping("/organizations/{id}")
    public ResponseEntity<PlatformDTO.OrganizationView> get(@PathVariable Long id) {
        return ResponseEntity.ok(view(find(id)));
    }

    // ───────────────────────────── Estado ─────────────────────────────

    @PostMapping("/organizations/{id}/suspend")
    public ResponseEntity<PlatformDTO.OrganizationView> suspend(@PathVariable Long id, Authentication auth) {
        find(id);
        subscriptionService.suspend(id);
        auditService.record(auth.getName(), "ORGANIZATION_SUSPENDED", id, null);
        return ResponseEntity.ok(view(find(id)));
    }

    @PostMapping("/organizations/{id}/reactivate")
    public ResponseEntity<PlatformDTO.OrganizationView> reactivate(@PathVariable Long id, Authentication auth) {
        find(id);
        subscriptionService.reactivate(id);
        auditService.record(auth.getName(), "ORGANIZATION_REACTIVATED", id, null);
        return ResponseEntity.ok(view(find(id)));
    }

    @PostMapping("/organizations/{id}/cancel")
    public ResponseEntity<PlatformDTO.OrganizationView> cancel(@PathVariable Long id, Authentication auth) {
        find(id);
        subscriptionService.cancel(id);
        auditService.record(auth.getName(), "ORGANIZATION_CANCELLED", id, null);
        return ResponseEntity.ok(view(find(id)));
    }

    // ───────────────────────────── Plan y cobro ─────────────────────────────

    @PostMapping("/organizations/{id}/extend-trial")
    public ResponseEntity<PlatformDTO.OrganizationView> extendTrial(
            @PathVariable Long id, @Valid @RequestBody PlatformDTO.ExtendTrial body, Authentication auth) {
        find(id);
        // Más de 7 días solo el dueño; el resto del equipo extiende pruebas cortas
        boolean owner = auth.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals(com.stockmind.platform.PlatformPermission.SENSITIVE.authority()));
        if (!owner && body.getDays() > com.stockmind.platform.PlatformPermission.MAX_TRIAL_EXTENSION_DAYS) {
            throw new org.springframework.security.access.AccessDeniedException("Solo el dueño extiende más de "
                + com.stockmind.platform.PlatformPermission.MAX_TRIAL_EXTENSION_DAYS + " días");
        }
        subscriptionService.extendTrial(id, body.getDays());
        auditService.record(auth.getName(), "TRIAL_EXTENDED", id, "días=" + body.getDays());
        return ResponseEntity.ok(view(find(id)));
    }

    @PostMapping("/organizations/{id}/plan")
    public ResponseEntity<PlatformDTO.OrganizationView> changePlan(
            @PathVariable Long id, @Valid @RequestBody PlatformDTO.PlanChange body, Authentication auth) {
        find(id);
        Plan plan = subscriptionService.planByCode(body.getPlanCode());
        subscriptionService.changePlan(id, plan, body.getBillingCycle(), body.getComplimentary());
        auditService.record(auth.getName(), "PLAN_CHANGED", id,
            "plan=" + plan.getCode() + " cortesía=" + body.getComplimentary());
        return ResponseEntity.ok(view(find(id)));
    }

    @PostMapping("/organizations/{id}/payment-links")
    public ResponseEntity<BillingDTO.PaymentView> paymentLink(
            @PathVariable Long id, @Valid @RequestBody PlatformDTO.PaymentLink body, Authentication auth) {
        find(id);
        Payment payment = paymentService.createCheckout(id, body.getPlanCode(), body.getBillingCycle(), true);
        auditService.record(auth.getName(), "PAYMENT_LINK_CREATED", id,
            "plan=" + body.getPlanCode() + " total=" + payment.getAmountTotal());
        return ResponseEntity.status(HttpStatus.CREATED).body(BillingDTO.PaymentView.of(
            payment, paymentService.checkoutUrl(payment), paymentService.simulationAllowed(), null));
    }

    @PostMapping("/organizations/{id}/manual-payment")
    public ResponseEntity<BillingDTO.PaymentView> manualPayment(
            @PathVariable Long id, @Valid @RequestBody PlatformDTO.PaymentLink body, Authentication auth) {
        find(id);
        Payment payment = paymentService.recordManualPayment(id, body.getPlanCode(), body.getBillingCycle());
        auditService.record(auth.getName(), "MANUAL_PAYMENT_RECORDED", id,
            "plan=" + body.getPlanCode() + " total=" + payment.getAmountTotal());
        return ResponseEntity.status(HttpStatus.CREATED).body(BillingDTO.PaymentView.of(payment, null, false, null));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private Organization find(Long id) {
        return organizationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
    }

    private PlatformDTO.OrganizationView view(Organization org) {
        return PlatformDTO.OrganizationView.of(org,
            subscriptionRepository.findByOrganizationId(org.getId()).orElse(null));
    }
}
