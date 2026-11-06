package com.stockmind.repository;

import com.stockmind.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByReference(String reference);
    List<Payment> findByOrganizationIdOrderByCreatedAtDesc(Long organizationId);
}
