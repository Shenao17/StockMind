package com.stockmind.repository.spec;

import com.stockmind.model.Sale;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Filtros combinables del listado de ventas. */
public final class SaleSpecs {

    private SaleSpecs() {}

    public static Specification<Sale> filter(LocalDateTime from, LocalDateTime to,
                                             Sale.Status status, Long userId) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.<LocalDateTime>get("createdAt"), from));
            if (to != null)   ps.add(cb.lessThanOrEqualTo(root.<LocalDateTime>get("createdAt"), to));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (userId != null) ps.add(cb.equal(root.get("user").get("id"), userId));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
