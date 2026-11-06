package com.stockmind.repository;

import com.stockmind.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
