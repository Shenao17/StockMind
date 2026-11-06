package com.stockmind.repository;

import com.stockmind.model.Organization;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OrganizationRepository extends JpaRepository<Organization, Long>, JpaSpecificationExecutor<Organization> {
    Optional<Organization> findByTaxId(String taxId);
    boolean existsByTaxId(String taxId);

    /** Empresas por estado: filas [estado, cantidad]. */
    @Query("select o.status, count(o) from Organization o group by o.status")
    List<Object[]> countByStatus();

    long countByCreatedAtGreaterThanEqual(LocalDateTime since);
}
