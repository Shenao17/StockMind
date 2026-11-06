package com.stockmind.repository;

import com.stockmind.model.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlanRepository extends JpaRepository<Plan, Long> {
    Optional<Plan> findByCode(String code);
    List<Plan> findByActiveTrueOrderBySortOrderAsc();
}
