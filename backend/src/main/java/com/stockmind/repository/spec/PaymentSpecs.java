package com.stockmind.repository.spec;

import com.stockmind.model.Payment;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Filtros combinables del listado de cobros del panel de plataforma. */
public final class PaymentSpecs {

    private PaymentSpecs() {}

    /**
     * @param status      PENDING (sin pagar y vigente), PAID, FAILED o EXPIRED (sin pagar y vencido); null = todos
     * @param orgIds      si no es null, solo cobros de esas empresas (vacío = ninguno)
     * @param from, to    rango (ambos inclusive) sobre la fecha de creación
     */
    public static Specification<Payment> filter(Payment.Status status, Long organizationId, Collection<Long> orgIds,
                                                LocalDate from, LocalDate to, LocalDateTime now) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (status != null) {
                switch (status) {
                    case PENDING -> {
                        ps.add(cb.equal(root.get("status"), Payment.Status.PENDING));
                        ps.add(cb.greaterThanOrEqualTo(root.get("expiresAt"), now));
                    }
                    case EXPIRED -> {
                        // lo vencido puede estar guardado como EXPIRED o como PENDING con la fecha ya pasada
                        ps.add(cb.or(cb.equal(root.get("status"), Payment.Status.EXPIRED),
                            cb.and(cb.equal(root.get("status"), Payment.Status.PENDING), cb.lessThan(root.get("expiresAt"), now))));
                    }
                    default -> ps.add(cb.equal(root.get("status"), status));
                }
            }
            if (organizationId != null) ps.add(cb.equal(root.get("organizationId"), organizationId));
            if (orgIds != null) {
                ps.add(orgIds.isEmpty() ? cb.disjunction() : root.get("organizationId").in(orgIds));
            }
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay()));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
