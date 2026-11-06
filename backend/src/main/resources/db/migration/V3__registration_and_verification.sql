-- =============================================================================
-- V3 — Registro de empresas: verificación de correo, prueba gratis y términos
-- =============================================================================

ALTER TABLE organizations
    ADD COLUMN trial_ends_at      DATETIME    NULL AFTER origin,   -- fin de la prueba gratis (autoregistro)
    ADD COLUMN terms_accepted_at  DATETIME    NULL AFTER trial_ends_at,
    ADD COLUMN terms_version      VARCHAR(20) NULL AFTER terms_accepted_at;

-- Los usuarios existentes se consideran verificados (ya operaban antes de este control)
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER active;
UPDATE users SET email_verified_at = created_at;

-- Se guarda SOLO el hash SHA-256 del token: quien lea la base no puede activar cuentas
CREATE TABLE email_verification_tokens (
    id          BIGINT   NOT NULL AUTO_INCREMENT,
    user_id     BIGINT   NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_email_verification_tokens PRIMARY KEY (id),
    CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_evt_token_hash UNIQUE (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_evt_user ON email_verification_tokens(user_id);
