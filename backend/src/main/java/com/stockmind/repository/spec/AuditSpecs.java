package com.stockmind.repository.spec;

import com.stockmind.model.AuditLog;
import com.stockmind.util.Paging;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Filtros combinables de la auditoría del panel de plataforma. */
public final class AuditSpecs {

    private AuditSpecs() {}

    public static Specification<AuditLog> filter(String action, String actor, Long organizationId, LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (action != null && !action.isBlank()) ps.add(cb.equal(root.get("action"), action.trim()));
            if (actor != null && !actor.isBlank()) {
                ps.add(cb.like(cb.lower(root.get("actorEmail")), Paging.likePattern(actor), '!'));
            }
            if (organizationId != null) ps.add(cb.equal(root.get("organizationId"), organizationId));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay()));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
