package com.stockmind.repository.spec;

import com.stockmind.model.Product;
import com.stockmind.util.Paging;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

/** Filtros combinables del listado de productos (solo activos). */
public final class ProductSpecs {

    private ProductSpecs() {}

    public static Specification<Product> filter(String search, Long categoryId, boolean lowStock) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.isTrue(root.get("active")));
            if (search != null && !search.isBlank()) {
                String like = Paging.likePattern(search);
                ps.add(cb.or(
                    cb.like(cb.lower(root.get("name")), like, '!'),
                    cb.like(cb.lower(root.get("sku")), like, '!')));
            }
            if (categoryId != null) {
                ps.add(cb.equal(root.get("category").get("id"), categoryId));
            }
            if (lowStock) {
                ps.add(cb.lessThanOrEqualTo(root.<Integer>get("stockCurrent"), root.<Integer>get("stockMinimum")));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
