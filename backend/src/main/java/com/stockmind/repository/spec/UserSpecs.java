package com.stockmind.repository.spec;

import com.stockmind.model.User;
import com.stockmind.util.Paging;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;

/** Filtros combinables del listado de usuarios. */
public final class UserSpecs {

    private UserSpecs() {}

    public static Specification<User> filter(String search, User.Role role, Boolean active) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = Paging.likePattern(search);
                ps.add(cb.or(
                    cb.like(cb.lower(root.get("username")), like, '!'),
                    cb.like(cb.lower(root.get("email")), like, '!')));
            }
            if (role != null) ps.add(cb.equal(root.get("role"), role));
            if (active != null) ps.add(cb.equal(root.get("active"), active));
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }
}
