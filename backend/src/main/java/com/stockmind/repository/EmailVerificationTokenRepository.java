package com.stockmind.repository;

import com.stockmind.model.EmailVerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    Optional<EmailVerificationToken> findTopByUserIdOrderByCreatedAtDesc(Long userId);

    /** Invalida los tokens pendientes de un usuario (al emitir uno nuevo). */
    @Modifying
    @Query("UPDATE EmailVerificationToken t SET t.usedAt = :now WHERE t.userId = :userId AND t.usedAt IS NULL")
    int invalidatePending(@Param("userId") Long userId, @Param("now") LocalDateTime now);
}
