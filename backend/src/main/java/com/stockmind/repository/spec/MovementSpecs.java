package com.stockmind.repository.spec;

import com.stockmind.model.InventoryMovement;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** Filtros combinables del historial de movimientos de inventario. */
public final class MovementSpecs {

    private MovementSpecs() {}

    public static Specification<InventoryMovement> filter(Long productId,
                                                          InventoryMovement.MovementType type,
                                                          LocalDateTime from, LocalDateTime to) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (productId != null) ps.add(cb.equal(root.get("product").get("id"), productId));
            if (type != null) ps.add(cb.equal(root.get("type"), type));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.<LocalDateTime>get("createdAt"), from));
            if (to != null)   ps.add(cb.lessThanOrEqualTo(root.<LocalDateTime>get("createdAt"), to));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
