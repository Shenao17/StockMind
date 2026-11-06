package com.stockmind.billing;

import com.stockmind.exception.BillingException;
import com.stockmind.model.Subscription;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.repository.UserRepository;
import com.stockmind.repository.spec.ProductSpecs;
import com.stockmind.repository.spec.UserSpecs;
import com.stockmind.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * EntitlementService — Qué puede hacer una empresa según su suscripción.
 *
 *  - Acceso: FULL (prueba o activa), READ_ONLY (venció, en gracia), BLOCKED (suspendida o cancelada)
 *  - Funciones premium del plan (REPORTS, PREDICTIONS, ...)
 *  - Límites: usuarios y productos activos
 *
 * El resultado se guarda en una caché de pocos segundos (no se consulta la base en cada
 * petición); cualquier cambio de suscripción llama a evict(). Con varias réplicas del backend
 * un cambio puede tardar hasta `cache-seconds` en verse en las demás.
 */
@Service
@RequiredArgsConstructor
public class EntitlementService {

    public enum Access { FULL, READ_ONLY, BLOCKED }

    public record Snapshot(Long organizationId, String planCode, String planName,
                           Subscription.Status status, Access access,
                           Set<String> features, int maxUsers, int maxProducts) {
        public boolean hasFeature(String feature) {
            return features.contains(feature);
        }
    }

    private record Cached(Snapshot snapshot, long expiresAtMillis) {}

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;

    @Value("${stockmind.billing.cache-seconds:30}")
    private long cacheSeconds;

    private final ConcurrentHashMap<Long, Cached> cache = new ConcurrentHashMap<>();

    public Snapshot snapshot(Long organizationId) {
        long now = System.currentTimeMillis();
        Cached cached = cache.get(organizationId);
        if (cached != null && cached.expiresAtMillis() > now) {
            return cached.snapshot();
        }
        Snapshot fresh = compute(organizationId);
        cache.put(organizationId, new Cached(fresh, now + cacheSeconds * 1000));
        return fresh;
    }

    public void evict(Long organizationId) {
        cache.remove(organizationId);
    }

    private Snapshot compute(Long organizationId) {
        // Una empresa sin suscripción no debería existir: se bloquea (falla cerrado)
        return subscriptionRepository.findByOrganizationId(organizationId)
            .map(s -> new Snapshot(organizationId, s.getPlan().getCode(), s.getPlan().getName(),
                s.getStatus(), accessOf(s.getStatus()), Set.copyOf(s.getPlan().getFeatures()),
                s.getPlan().getMaxUsers(), s.getPlan().getMaxProducts()))
            .orElseGet(() -> new Snapshot(organizationId, null, null, Subscription.Status.SUSPENDED,
                Access.BLOCKED, Set.of(), 0, 0));
    }

    static Access accessOf(Subscription.Status status) {
        return switch (status) {
            case TRIAL, ACTIVE -> Access.FULL;
            case GRACE -> Access.READ_ONLY;
            case SUSPENDED, CANCELLED -> Access.BLOCKED;
        };
    }

    // ───────────────────────────── Límites ─────────────────────────────

    /** Antes de crear (o reactivar) un usuario de la empresa actual. */
    public void assertCanAddUser(Long organizationId) {
        Snapshot s = snapshot(organizationId);
        long active = userRepository.count(UserSpecs.filter(organizationId, null, null, true));
        if (active >= s.maxUsers()) {
            throw new BillingException(HttpStatus.PAYMENT_REQUIRED, "PLAN_LIMIT_REACHED",
                "Tu plan " + s.planName() + " permite hasta " + s.maxUsers()
                    + " usuarios activos. Cambia de plan para agregar más.");
        }
    }

    /** Antes de crear un producto en la empresa actual (el conteo respeta el filtro de empresa). */
    public void assertCanAddProduct() {
        Snapshot s = snapshot(TenantContext.require());
        long active = productRepository.count(ProductSpecs.filter(null, null, false));
        if (active >= s.maxProducts()) {
            throw new BillingException(HttpStatus.PAYMENT_REQUIRED, "PLAN_LIMIT_REACHED",
                "Tu plan " + s.planName() + " permite hasta " + s.maxProducts()
                    + " productos activos. Cambia de plan para agregar más.");
        }
    }

    public long activeUsers(Long organizationId) {
        return userRepository.count(UserSpecs.filter(organizationId, null, null, true));
    }

    public long activeProducts() {
        return productRepository.count(ProductSpecs.filter(null, null, false));
    }
}
