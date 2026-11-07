-- =============================================================================
-- V7 — Solicitudes con aprobación del dueño de la plataforma
-- =============================================================================
-- Soporte y Cobranza piden acciones sensibles (suspender, cancelar, cambiar plan, pago manual,
-- extender pruebas largas, corregir NIT); el Dueño las aprueba (con su PIN) o las rechaza.
CREATE TABLE platform_requests (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    type            ENUM('SUSPEND', 'CANCEL', 'CHANGE_PLAN', 'MANUAL_PAYMENT', 'EXTEND_TRIAL', 'CHANGE_TAX_ID') NOT NULL,
    organization_id BIGINT        NOT NULL,
    params          VARCHAR(1000) NULL,        -- JSON con los parámetros de la acción (plan, días, NIT...)
    reason          VARCHAR(500)  NOT NULL,
    status          ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL,
    requested_by    VARCHAR(100)  NOT NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_by      VARCHAR(100)  NULL,
    decided_at      DATETIME      NULL,
    decision_note   VARCHAR(500)  NULL,
    CONSTRAINT pk_platform_requests PRIMARY KEY (id),
    CONSTRAINT fk_preq_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_preq_status ON platform_requests(status, created_at);
CREATE INDEX idx_preq_org ON platform_requests(organization_id);
CREATE INDEX idx_preq_requester ON platform_requests(requested_by, created_at);
