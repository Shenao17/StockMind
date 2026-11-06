package com.stockmind.repository;

import com.stockmind.model.Subscription;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findByOrganizationId(Long organizationId);

    List<Subscription> findByOrganizationIdIn(Collection<Long> organizationIds);

    List<Subscription> findByStatus(Subscription.Status status);

    long countByPlanId(Long planId);

    /** Suscripciones por estado: filas [estado, cantidad]. */
    @Query("select s.status, count(s) from Subscription s group by s.status")
    List<Object[]> countByStatus();

    long countByComplimentaryTrue();

    /** Suscripciones vigentes por plan (prueba, activas y en gracia): filas [código del plan, cantidad]. */
    @Query("select p.code, count(s) from Subscription s join s.plan p where s.status in :statuses group by p.code")
    List<Object[]> countByPlan(@Param("statuses") Collection<Subscription.Status> statuses);

    /** Suma de precios mensuales (sin IVA) de las suscripciones de pago con ciclo mensual; base del MRR. */
    @Query("select coalesce(sum(p.priceMonthly), 0) from Subscription s join s.plan p "
         + "where s.status = :status and s.complimentary = false and s.billingCycle = :cycle")
    long sumMonthlyPrices(@Param("status") Subscription.Status status, @Param("cycle") Subscription.BillingCycle cycle);

    /** Suma de precios anuales (sin IVA) de las suscripciones de pago con ciclo anual; base del MRR (÷ 12). */
    @Query("select coalesce(sum(p.priceYearly), 0) from Subscription s join s.plan p "
         + "where s.status = :status and s.complimentary = false and s.billingCycle = :cycle")
    long sumYearlyPrices(@Param("status") Subscription.Status status, @Param("cycle") Subscription.BillingCycle cycle);

    List<Subscription> findByStatusAndTrialEndsAtLessThanEqualOrderByTrialEndsAtAsc(
        Subscription.Status status, LocalDateTime limit, Pageable pageable);

    List<Subscription> findByStatusOrderByGraceEndsAtAsc(Subscription.Status status, Pageable pageable);
}
