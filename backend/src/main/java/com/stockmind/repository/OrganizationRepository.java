package com.stockmind.repository;

import com.stockmind.model.Organization;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OrganizationRepository extends JpaRepository<Organization, Long> {
    Optional<Organization> findByTaxId(String taxId);
    boolean existsByTaxId(String taxId);
}
