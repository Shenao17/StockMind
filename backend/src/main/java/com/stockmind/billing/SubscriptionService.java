package com.stockmind.billing;

import com.stockmind.exception.BillingException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Organization;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import com.stockmind.model.Subscription.BillingCycle;
import com.stockmind.model.Subscription.Status;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PlanRepository;
import com.stockmind.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * SubscriptionService — Cambios de estado de las suscripciones.
 *
 * Estados: TRIAL → ACTIVE (al pagar) · TRIAL/ACTIVE → GRACE (venció) → SUSPENDED → CANCELLED.
 * Un cambio en la suscripción mantiene sincronizado el estado de la empresa (organizations.status):
 * solo una empresa ACTIVE puede iniciar sesión.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final PlanRepository planRepository;
    private final OrganizationRepository organizationRepository;
    private final EntitlementService entitlementService;

    @Value("${stockmind.trial-days:14}")
    private int trialDays;

    @Value("${stockmind.billing.grace-days:7}")
    private int graceDays;

    @Value("${stockmind.billing.default-plan:PRO}")
    private String defaultPlanCode;

    // ───────────────────────────── Consultas ─────────────────────────────

    public Plan planByCode(String code) {
        String wanted = (code == null || code.isBlank()) ? defaultPlanCode : code.trim().toUpperCase();
        return planRepository.findByCode(wanted)
            .filter(Plan::getActive)
            .orElseThrow(() -> new IllegalArgumentException("El plan '" + wanted + "' no existe o no está disponible"));
    }

    public Subscription forOrganization(Long organizationId) {
        return subscriptionRepository.findByOrganizationId(organizationId)
            .orElseThrow(() -> new ResourceNotFoundException("La empresa no tiene suscripción"));
    }

    // ───────────────────────────── Altas ─────────────────────────────

    /** Autoregistro: la prueba aún no corre (empieza al verificar el correo). */
    @Transactional
    public Subscription createPendingTrial(Organization org, Plan plan) {
        return subscriptionRepository.save(Subscription.builder()
            .organizationId(org.getId()).plan(plan).status(Status.TRIAL).build());
    }

    /** Al verificar el correo del autoregistro: empieza la prueba gratis. */
    @Transactional
    public Subscription startTrial(Long organizationId) {
        Subscription s = forOrganization(organizationId);
        LocalDateTime now = LocalDateTime.now();
        s.setStatus(Status.TRIAL);
        s.setTrialEndsAt(now.plusDays(trialDays));
        s.setReminder5dSentAt(null);
        s.setReminder1dSentAt(null);
        return save(s);
    }

    /** Alta por plataforma con prueba: la prueba corre desde ya. */
    @Transactional
    public Subscription createTrial(Organization org, Plan plan) {
        Subscription s = subscriptionRepository.save(Subscription.builder()
            .organizationId(org.getId()).plan(plan).status(Status.TRIAL)
            .trialEndsAt(LocalDateTime.now().plusDays(trialDays)).build());
        entitlementService.evict(org.getId());
        return s;
    }

    /** Alta por plataforma sin cobro (cortesía): acceso completo sin vencimiento. */
    @Transactional
    public Subscription createComplimentary(Organization org, Plan plan) {
        Subscription s = subscriptionRepository.save(Subscription.builder()
            .organizationId(org.getId()).plan(plan).status(Status.ACTIVE).complimentary(true)
            .currentPeriodStart(LocalDateTime.now()).build());
        entitlementService.evict(org.getId());
        return s;
    }

    // ───────────────────────────── Pago ─────────────────────────────

    /**
     * Un pago confirmado activa el plan. Si la suscripción ya estaba ACTIVE y vigente, el nuevo
     * periodo se suma al final del actual (no se pierde lo pagado por adelantado).
     */
    @Transactional
    public Subscription activate(Long organizationId, Plan plan, BillingCycle cycle, LocalDateTime paidAt) {
        Subscription s = forOrganization(organizationId);
        LocalDateTime start = (s.getStatus() == Status.ACTIVE && s.getCurrentPeriodEnd() != null
                && s.getCurrentPeriodEnd().isAfter(paidAt)) ? s.getCurrentPeriodEnd() : paidAt;

        s.setPlan(plan);
        s.setBillingCycle(cycle);
        s.setStatus(Status.ACTIVE);
        s.setCurrentPeriodStart(start);
        s.setCurrentPeriodEnd(cycle == BillingCycle.YEARLY ? start.plusYears(1) : start.plusMonths(1));
        s.setGraceEndsAt(null);
        s.setSuspendedAt(null);
        s.setReminder5dSentAt(null);
        s.setReminder1dSentAt(null);
        setOrganizationStatus(organizationId, Organization.Status.ACTIVE);
        return save(s);
    }

    // ───────────────────────────── Acciones de plataforma ─────────────────────────────

    @Transactional
    public Subscription suspend(Long organizationId) {
        Subscription s = forOrganization(organizationId);
        requireVerified(organizationId);
        s.setStatus(Status.SUSPENDED);
        s.setSuspendedAt(LocalDateTime.now());
        setOrganizationStatus(organizationId, Organization.Status.SUSPENDED);
        return save(s);
    }

    /** Devuelve el acceso: según lo que le quede vigente (prueba, periodo pagado o cortesía) o, si nada, gracia. */
    @Transactional
    public Subscription reactivate(Long organizationId) {
        Subscription s = forOrganization(organizationId);
        requireVerified(organizationId);
        LocalDateTime now = LocalDateTime.now();
        if (Boolean.TRUE.equals(s.getComplimentary())
                || (s.getCurrentPeriodEnd() != null && s.getCurrentPeriodEnd().isAfter(now))) {
            s.setStatus(Status.ACTIVE);
            s.setGraceEndsAt(null);
        } else if (s.getTrialEndsAt() != null && s.getTrialEndsAt().isAfter(now) && s.getCurrentPeriodEnd() == null) {
            s.setStatus(Status.TRIAL);
        } else {
            s.setStatus(Status.GRACE);
            s.setGraceEndsAt(now.plusDays(graceDays));
        }
        s.setSuspendedAt(null);
        setOrganizationStatus(organizationId, Organization.Status.ACTIVE);
        return save(s);
    }

    @Transactional
    public Subscription cancel(Long organizationId) {
        Subscription s = forOrganization(organizationId);
        requireVerified(organizationId);
        s.setStatus(Status.CANCELLED);
        setOrganizationStatus(organizationId, Organization.Status.CANCELLED);
        return save(s);
    }

    /** Suma días de prueba; si la prueba ya había vencido (o estaba en gracia/suspendida) la reinicia desde hoy. */
    @Transactional
    public Subscription extendTrial(Long organizationId, int days) {
        if (days < 1 || days > 90) {
            throw new IllegalArgumentException("Los días de prueba deben estar entre 1 y 90");
        }
        Subscription s = forOrganization(organizationId);
        requireVerified(organizationId);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime base = (s.getStatus() == Status.TRIAL && s.getTrialEndsAt() != null
                && s.getTrialEndsAt().isAfter(now)) ? s.getTrialEndsAt() : now;
        s.setStatus(Status.TRIAL);
        s.setTrialEndsAt(base.plusDays(days));
        s.setCurrentPeriodEnd(null);
        s.setGraceEndsAt(null);
        s.setSuspendedAt(null);
        s.setReminder5dSentAt(null);
        s.setReminder1dSentAt(null);
        setOrganizationStatus(organizationId, Organization.Status.ACTIVE);
        return save(s);
    }

    /** Cambio de plan acordado (sin cobro por el sistema). No altera fechas ni estado. */
    @Transactional
    public Subscription changePlan(Long organizationId, Plan plan, BillingCycle cycle, Boolean complimentary) {
        Subscription s = forOrganization(organizationId);
        s.setPlan(plan);
        if (cycle != null) s.setBillingCycle(cycle);
        if (complimentary != null) s.setComplimentary(complimentary);
        return save(s);
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private void requireVerified(Long organizationId) {
        Organization org = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
        if (org.getStatus() == Organization.Status.PENDING) {
            throw new BillingException(HttpStatus.CONFLICT, "ORGANIZATION_PENDING",
                "La empresa aún no verificó su correo electrónico");
        }
    }

    void setOrganizationStatus(Long organizationId, Organization.Status status) {
        Organization org = organizationRepository.findById(organizationId)
            .orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
        if (org.getStatus() != status) {
            org.setStatus(status);
            organizationRepository.save(org);
        }
    }

    Subscription save(Subscription s) {
        Subscription saved = subscriptionRepository.save(s);
        entitlementService.evict(saved.getOrganizationId());
        return saved;
    }
}
