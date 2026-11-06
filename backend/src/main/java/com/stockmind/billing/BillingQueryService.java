package com.stockmind.billing;

import com.stockmind.dto.BillingDTO;
import com.stockmind.model.Subscription;
import com.stockmind.repository.PlanRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/** Arma las vistas de planes y de la suscripción de la empresa actual. */
@Service
@RequiredArgsConstructor
public class BillingQueryService {

    private final PlanRepository planRepository;
    private final SubscriptionService subscriptionService;
    private final EntitlementService entitlementService;

    @Value("${stockmind.billing.iva-rate:0.19}")
    private double ivaRate;

    public List<BillingDTO.PlanView> plans() {
        return planRepository.findByActiveTrueOrderBySortOrderAsc().stream()
            .map(p -> BillingDTO.PlanView.of(p, ivaRate)).toList();
    }

    /** Debe llamarse con la empresa en el TenantContext (el conteo de productos respeta el filtro). */
    public BillingDTO.SubscriptionView subscriptionOf(Long organizationId) {
        return subscriptionOf(organizationId, entitlementService.activeProducts());
    }

    /** Variante para el panel de plataforma: el conteo de productos lo calcula quien llama (sin empresa en sesión). */
    public BillingDTO.SubscriptionView subscriptionOf(Long organizationId, long activeProducts) {
        Subscription s = subscriptionService.forOrganization(organizationId);
        EntitlementService.Snapshot snap = entitlementService.snapshot(organizationId);

        Long daysLeft = null;
        if (s.getStatus() == Subscription.Status.TRIAL && s.getTrialEndsAt() != null) {
            daysLeft = Math.max(0, (long) Math.ceil(
                Duration.between(LocalDateTime.now(), s.getTrialEndsAt()).toMinutes() / (60.0 * 24)));
        }
        return new BillingDTO.SubscriptionView(
            s.getPlan().getCode(), s.getPlan().getName(), s.getStatus(), s.getBillingCycle(),
            Boolean.TRUE.equals(s.getComplimentary()), s.getTrialEndsAt(), daysLeft,
            s.getCurrentPeriodEnd(), s.getGraceEndsAt(),
            snap.access() == EntitlementService.Access.READ_ONLY,
            snap.access() == EntitlementService.Access.BLOCKED,
            snap.features().stream().sorted().toList(), snap.maxUsers(), snap.maxProducts(),
            new BillingDTO.Usage(entitlementService.activeUsers(organizationId), activeProducts));
    }
}
