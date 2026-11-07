package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.billing.BillingQueryService;
import com.stockmind.dto.BillingDTO;
import com.stockmind.dto.CompanyDetailDTO;
import com.stockmind.dto.PlatformDTO;
import com.stockmind.exception.ConflictException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.AuditLog;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformPermission;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.repository.AuditLogRepository;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PaymentRepository;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.repository.UserRepository;
import com.stockmind.service.RegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * PlatformDetailController — Ficha de una empresa en el panel de plataforma.
 *
 * GET   /platform/organizations/{id}/detail   → datos, plan y uso, usuarios, cobros y línea de tiempo (ORG_VIEW)
 * PATCH /platform/organizations/{id}/contact  → corregir nombre, teléfono, correo, país (ORG_EDIT_CONTACT)
 * PATCH /platform/organizations/{id}/tax-id   → corregir el NIT (solo el dueño, con su PIN)
 *
 * Es información de operación de la cuenta: nunca se exponen datos de negocio de la empresa. Los cobros
 * solo los ven roles con PAYMENT_VIEW; las correcciones quedan auditadas con el valor anterior y el nuevo.
 */
@RestController
@RequestMapping("/platform/organizations/{id}")
@RequiredArgsConstructor
public class PlatformDetailController {

    private static final int TIMELINE_AUDIT_LIMIT = 100;

    private final OrganizationRepository organizationRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final PaymentRepository paymentRepository;
    private final AuditLogRepository auditLogRepository;
    private final BillingQueryService billingQueryService;
    private final ProductRepository productRepository;
    private final PlatformSecurityService platformSecurity;
    private final AuditService auditService;
    private final com.stockmind.platform.PlatformActionService actions;

    @GetMapping("/detail")
    public ResponseEntity<CompanyDetailDTO.Detail> detail(@PathVariable Long id, Authentication auth) {
        Organization org = find(id);
        boolean paymentsVisible = has(auth, PlatformPermission.PAYMENT_VIEW);
        LocalDateTime now = LocalDateTime.now();

        var sub = subscriptionRepository.findByOrganizationId(id).orElse(null);
        BillingDTO.SubscriptionView plan = sub == null ? null
            : billingQueryService.subscriptionOf(id, productRepository.countActiveByOrganizationId(id));

        List<CompanyDetailDTO.UserRow> users = userRepository.findAll(
                com.stockmind.repository.spec.UserSpecs.filter(id, null, null, null),
                Sort.by("id"))
            .stream().map(CompanyDetailDTO.UserRow::of).toList();

        List<Payment> payments = paymentsVisible
            ? paymentRepository.findByOrganizationIdOrderByCreatedAtDesc(id) : List.of();

        return ResponseEntity.ok(CompanyDetailDTO.Detail.of(org, PlatformDTO.OrganizationView.of(org, sub),
            plan, users, paymentsVisible,
            payments.stream().map(p -> CompanyDetailDTO.PaymentRow.of(p, now)).toList(),
            timeline(org, payments, paymentsVisible)));
    }

    @PatchMapping("/contact")
    public ResponseEntity<PlatformDTO.OrganizationView> contact(@PathVariable Long id,
            @Valid @RequestBody CompanyDetailDTO.ContactUpdate body, Authentication auth) {
        Organization org = find(id);
        List<String> changes = new ArrayList<>();
        if (body.getName() != null && !body.getName().isBlank() && !body.getName().trim().equals(org.getName())) {
            changes.add("nombre: " + org.getName() + " → " + body.getName().trim());
            org.setName(body.getName().trim());
        }
        if (body.getLegalName() != null && !body.getLegalName().trim().equals(String.valueOf(org.getLegalName() == null ? "" : org.getLegalName()))) {
            changes.add("razón social: " + nullToDash(org.getLegalName()) + " → " + nullToDash(body.getLegalName().trim()));
            org.setLegalName(body.getLegalName().trim().isEmpty() ? null : body.getLegalName().trim());
        }
        if (body.getPhone() != null && !body.getPhone().trim().equals(String.valueOf(org.getPhone() == null ? "" : org.getPhone()))) {
            changes.add("teléfono: " + nullToDash(org.getPhone()) + " → " + body.getPhone().trim());
            org.setPhone(body.getPhone().trim());
        }
        if (body.getContactEmail() != null && !body.getContactEmail().isBlank()
                && !body.getContactEmail().trim().equalsIgnoreCase(org.getContactEmail())) {
            changes.add("correo de contacto: " + org.getContactEmail() + " → " + body.getContactEmail().trim().toLowerCase());
            org.setContactEmail(body.getContactEmail().trim().toLowerCase());
        }
        if (body.getCountry() != null && !body.getCountry().isBlank() && !body.getCountry().toUpperCase().equals(org.getCountry())) {
            changes.add("país: " + org.getCountry() + " → " + body.getCountry().toUpperCase());
            org.setCountry(body.getCountry().toUpperCase());
        }
        if (changes.isEmpty()) {
            throw new IllegalArgumentException("No hay cambios que guardar");
        }
        organizationRepository.save(org);
        auditService.record(auth.getName(), "ORGANIZATION_CONTACT_UPDATED", id, String.join("; ", changes));
        return ResponseEntity.ok(PlatformDTO.OrganizationView.of(org, subscriptionRepository.findByOrganizationId(id).orElse(null)));
    }

    @PatchMapping("/tax-id")
    public ResponseEntity<PlatformDTO.OrganizationView> taxId(@PathVariable Long id,
            @Valid @RequestBody CompanyDetailDTO.TaxIdUpdate body, Authentication auth) {
        Organization org = find(id);
        User actor = userRepository.findByEmail(auth.getName())
            .orElseThrow(() -> new BadCredentialsException("Sesión no válida"));
        platformSecurity.verifyPin(actor, body.getPin());

        actions.changeTaxId(id, body.getTaxId(), auth.getName(), null);
        org = find(id);
        return ResponseEntity.ok(PlatformDTO.OrganizationView.of(org, subscriptionRepository.findByOrganizationId(id).orElse(null)));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private List<CompanyDetailDTO.TimelineEvent> timeline(Organization org, List<Payment> payments, boolean paymentsVisible) {
        List<CompanyDetailDTO.TimelineEvent> events = new ArrayList<>();
        events.add(new CompanyDetailDTO.TimelineEvent(org.getCreatedAt(), "ORGANIZATION",
            org.getOrigin() == Organization.Origin.SELF_SIGNUP ? "Se registró desde la web" : "Creada desde el panel de plataforma", null, null));
        if (org.getTermsAcceptedAt() != null) {
            events.add(new CompanyDetailDTO.TimelineEvent(org.getTermsAcceptedAt(), "ORGANIZATION",
                "Aceptó los términos", null, org.getTermsVersion() == null ? null : "versión " + org.getTermsVersion()));
        }
        for (AuditLog a : auditLogRepository.findByOrganizationIdOrderByCreatedAtDescIdDesc(
                org.getId(), PageRequest.of(0, TIMELINE_AUDIT_LIMIT))) {
            events.add(new CompanyDetailDTO.TimelineEvent(a.getCreatedAt(), "AUDIT", a.getAction(), a.getActorEmail(), a.getDetails()));
        }
        if (paymentsVisible) {
            for (Payment p : payments) {
                events.add(new CompanyDetailDTO.TimelineEvent(p.getCreatedAt(), "PAYMENT",
                    "Cobro " + p.getPlan().getName() + " generado", null, "total " + p.getAmountTotal()));
                if (p.getPaidAt() != null) {
                    events.add(new CompanyDetailDTO.TimelineEvent(p.getPaidAt(), "PAYMENT",
                        "Pago recibido " + p.getPlan().getName(), null, "total " + p.getAmountTotal()));
                }
            }
        }
        events.sort(Comparator.comparing(CompanyDetailDTO.TimelineEvent::at).reversed());
        return events;
    }

    private static boolean has(Authentication auth, PlatformPermission p) {
        return auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals(p.authority()));
    }

    private static String nullToDash(String v) {
        return v == null || v.isBlank() ? "—" : v;
    }

    private Organization find(Long id) {
        return organizationRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
    }
}
