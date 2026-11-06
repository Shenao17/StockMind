package com.stockmind.repository;

import com.stockmind.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long>, JpaSpecificationExecutor<Payment> {
    Optional<Payment> findByReference(String reference);
    List<Payment> findByOrganizationIdOrderByCreatedAtDesc(Long organizationId);

    /** Cobros pagados entre dos fechas (por fecha de pago): una fila [neto, IVA, total, cantidad]. */
    @Query("select coalesce(sum(p.amountNet), 0), coalesce(sum(p.ivaAmount), 0), coalesce(sum(p.amountTotal), 0), count(p) "
         + "from Payment p where p.status = :status and p.paidAt >= :from and p.paidAt < :to")
    List<Object[]> paidBetween(@Param("status") Payment.Status status,
                               @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Enlaces sin pagar y aún vigentes: una fila [cantidad, total]. */
    @Query("select count(p), coalesce(sum(p.amountTotal), 0) from Payment p where p.status = :status and p.expiresAt > :now")
    List<Object[]> pendingSince(@Param("status") Payment.Status status, @Param("now") LocalDateTime now);

    long countByStatusAndCreatedAtGreaterThanEqual(Payment.Status status, LocalDateTime since);
}
