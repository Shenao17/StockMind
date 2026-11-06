package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Código de respaldo de un solo uso del equipo de plataforma (se guarda solo su hash). */
@Entity
@Table(name = "platform_backup_codes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlatformBackupCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "code_hash", nullable = false, columnDefinition = "CHAR(64)")
    private String codeHash;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
