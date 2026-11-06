package com.stockmind.repository;

import com.stockmind.model.PlatformBackupCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PlatformBackupCodeRepository extends JpaRepository<PlatformBackupCode, Long> {
    Optional<PlatformBackupCode> findByUserIdAndCodeHashAndUsedAtIsNull(Long userId, String codeHash);
    void deleteByUserId(Long userId);
    long countByUserIdAndUsedAtIsNull(Long userId);
}
