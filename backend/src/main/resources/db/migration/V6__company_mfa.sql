-- =============================================================================
-- V6 — Verificación en dos pasos para usuarios de empresa
-- =============================================================================
-- El 2FA es opcional por usuario; con require_mfa el administrador de la empresa lo exige a todos
-- (quien no lo tenga lo configura en su siguiente inicio de sesión).
ALTER TABLE organizations
    ADD COLUMN require_mfa TINYINT(1) NOT NULL DEFAULT 0;
