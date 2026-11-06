-- =============================================================================
-- V5 — Equipo de plataforma: roles, verificación en dos pasos (TOTP + PIN)
-- =============================================================================

-- PLATFORM_ADMIN pasa a ser PLATFORM_OWNER; se agregan tres roles de plataforma.
ALTER TABLE users MODIFY COLUMN role
    ENUM('PLATFORM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_BILLING', 'PLATFORM_SUPPORT', 'PLATFORM_VIEWER',
         'ADMIN', 'SELLER') NOT NULL DEFAULT 'SELLER';
UPDATE users SET role = 'PLATFORM_OWNER' WHERE role = 'PLATFORM_ADMIN';
ALTER TABLE users MODIFY COLUMN role
    ENUM('PLATFORM_OWNER', 'PLATFORM_BILLING', 'PLATFORM_SUPPORT', 'PLATFORM_VIEWER',
         'ADMIN', 'SELLER') NOT NULL DEFAULT 'SELLER';

ALTER TABLE users
    ADD COLUMN full_name            VARCHAR(100) NULL,
    ADD COLUMN mfa_secret           VARCHAR(255) NULL,   -- secreto TOTP cifrado (AES-GCM), nunca en claro
    ADD COLUMN mfa_enabled_at       DATETIME     NULL,   -- null = aún no configurado
    ADD COLUMN mfa_last_step        BIGINT       NULL,   -- último paso TOTP usado (evita reutilizar un código)
    ADD COLUMN mfa_failed_attempts  INT          NOT NULL DEFAULT 0,
    ADD COLUMN mfa_locked_until     DATETIME     NULL,
    ADD COLUMN pin_hash             VARCHAR(100) NULL,   -- PIN de confirmación (BCrypt)
    ADD COLUMN pin_failed_attempts  INT          NOT NULL DEFAULT 0,
    ADD COLUMN pin_locked_until     DATETIME     NULL,
    ADD COLUMN must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
    ADD COLUMN sessions_valid_from  DATETIME     NULL;   -- sesiones emitidas antes de esta fecha se rechazan

-- Códigos de respaldo (un solo uso). Solo se guarda el hash SHA-256.
CREATE TABLE platform_backup_codes (
    id         BIGINT   NOT NULL AUTO_INCREMENT,
    user_id    BIGINT   NOT NULL,
    code_hash  CHAR(64) NOT NULL,
    used_at    DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_platform_backup_codes PRIMARY KEY (id),
    CONSTRAINT fk_pbc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_pbc_hash UNIQUE (user_id, code_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
