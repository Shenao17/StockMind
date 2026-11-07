package com.stockmind.repository;

import com.stockmind.model.PlatformRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface PlatformRequestRepository extends JpaRepository<PlatformRequest, Long>, JpaSpecificationExecutor<PlatformRequest> {
    boolean existsByTypeAndOrganizationIdAndStatus(PlatformRequest.Type type, Long organizationId, PlatformRequest.Status status);
    long countByStatus(PlatformRequest.Status status);
}
