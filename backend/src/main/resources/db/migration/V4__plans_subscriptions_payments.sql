-- =============================================================================
-- V4 — Planes, suscripciones, pagos y auditoría
-- =============================================================================
-- Los precios de los planes son un BORRADOR (ver docs/PLANES_Y_PRECIOS.md); se pueden cambiar
-- con una migración nueva o desde el panel sin tocar el código. Valores en COP, SIN IVA.

CREATE TABLE plans (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    code             VARCHAR(20) NOT NULL,
    name             VARCHAR(50) NOT NULL,
    price_monthly    BIGINT      NOT NULL,
    price_yearly     BIGINT      NOT NULL,
    max_users        INT         NOT NULL,
    max_products     INT         NOT NULL,
    extra_user_price BIGINT      NOT NULL DEFAULT 0,
    active           BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order       INT         NOT NULL DEFAULT 0,
    created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_plans PRIMARY KEY (id),
    CONSTRAINT uk_plans_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Funciones "premium" por plan. Inventario, ventas y dashboard están en todos los planes.
CREATE TABLE plan_features (
    plan_id BIGINT      NOT NULL,
    feature VARCHAR(30) NOT NULL,
    CONSTRAINT pk_plan_features PRIMARY KEY (plan_id, feature),
    CONSTRAINT fk_plan_features_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_products, extra_user_price, sort_order) VALUES
('STARTER',  'Starter',   59900,  599000,  2,   300, 15000, 1),
('PRO',      'Pro',      119900, 1199000,  5,  3000, 15000, 2),
('BUSINESS', 'Business', 249900, 2499000, 15, 20000, 12000, 3);

INSERT INTO plan_features (plan_id, feature)
SELECT id, 'REPORTS'      FROM plans WHERE code IN ('PRO', 'BUSINESS');
INSERT INTO plan_features (plan_id, feature)
SELECT id, 'PREDICTIONS'  FROM plans WHERE code IN ('PRO', 'BUSINESS');
INSERT INTO plan_features (plan_id, feature)
SELECT id, 'EXPORT'       FROM plans WHERE code IN ('PRO', 'BUSINESS');
INSERT INTO plan_features (plan_id, feature)
SELECT id, 'AI_ASSISTANT' FROM plans WHERE code = 'BUSINESS';
INSERT INTO plan_features (plan_id, feature)
SELECT id, 'API'          FROM plans WHERE code = 'BUSINESS';

-- Una suscripción por empresa. NO usa el filtro automático de empresa: el ciclo de vida
-- (tarea diaria) y el panel de plataforma operan entre empresas.
CREATE TABLE subscriptions (
    id                   BIGINT   NOT NULL AUTO_INCREMENT,
    organization_id      BIGINT   NOT NULL,
    plan_id              BIGINT   NOT NULL,
    status               ENUM('TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED') NOT NULL,
    billing_cycle        ENUM('MONTHLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    complimentary        BOOLEAN  NOT NULL DEFAULT FALSE,   -- cortesía/interna: sin cobro, acceso completo
    trial_ends_at        DATETIME NULL,
    current_period_start DATETIME NULL,
    current_period_end   DATETIME NULL,
    grace_ends_at        DATETIME NULL,
    suspended_at         DATETIME NULL,
    reminder_5d_sent_at  DATETIME NULL,
    reminder_1d_sent_at  DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_subscriptions PRIMARY KEY (id),
    CONSTRAINT uk_subscriptions_org UNIQUE (organization_id),
    CONSTRAINT fk_subscriptions_org  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Las empresas que ya existían quedan con una suscripción de cortesía (plan Business)
INSERT INTO subscriptions (organization_id, plan_id, status, billing_cycle, complimentary, current_period_start)
SELECT o.id,
       (SELECT id FROM plans WHERE code = 'BUSINESS'),
       CASE o.status WHEN 'ACTIVE' THEN 'ACTIVE' WHEN 'SUSPENDED' THEN 'SUSPENDED'
                     WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'TRIAL' END,
       'MONTHLY', TRUE, NOW()
FROM organizations o;

-- Cobros. `reference` es el identificador impredecible del enlace de pago.
CREATE TABLE payments (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    organization_id     BIGINT       NOT NULL,
    plan_id             BIGINT       NOT NULL,
    billing_cycle       ENUM('MONTHLY', 'YEARLY') NOT NULL,
    reference           VARCHAR(64)  NOT NULL,
    provider            VARCHAR(20)  NOT NULL,              -- SIMULATED, MANUAL, WOMPI...
    amount_net          BIGINT       NOT NULL,              -- sin IVA
    iva_amount          BIGINT       NOT NULL,
    amount_total        BIGINT       NOT NULL,              -- lo que paga el cliente
    status              ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    created_by_platform BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at          DATETIME     NOT NULL,
    paid_at             DATETIME     NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_payments PRIMARY KEY (id),
    CONSTRAINT uk_payments_reference UNIQUE (reference),
    CONSTRAINT fk_payments_org  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_payments_org ON payments(organization_id, created_at);

-- Auditoría de acciones sensibles (hoy: panel de plataforma)
CREATE TABLE audit_log (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    actor_email     VARCHAR(100) NOT NULL,
    action          VARCHAR(50)  NOT NULL,
    organization_id BIGINT       NULL,
    details         VARCHAR(500) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_audit_log PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_audit_org ON audit_log(organization_id, created_at);
