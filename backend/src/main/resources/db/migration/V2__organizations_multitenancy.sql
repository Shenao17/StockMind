-- =============================================================================
-- V2 — Multiempresa: organizaciones y aislamiento por organization_id
-- =============================================================================
-- Cada empresa cliente es una fila de `organizations`. Todos los datos de negocio
-- (categorías, productos, ventas, movimientos, predicciones) pertenecen a UNA empresa.
-- Los datos existentes se asignan a la empresa inicial (id = 1).
--
-- Reglas que cambian:
--   * SKU de producto, nombre de categoría y username pasan de únicos globales a
--     únicos POR EMPRESA (dos empresas pueden vender "ELEC-001").
--   * El correo del usuario sigue siendo único en toda la plataforma (es el login).
--   * users.organization_id es NULL solo para el rol PLATFORM_ADMIN (dueño de la plataforma).
-- =============================================================================

CREATE TABLE organizations (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    name          VARCHAR(150)  NOT NULL,
    legal_name    VARCHAR(200),
    tax_id        VARCHAR(30)   UNIQUE,                       -- NIT / identificación fiscal
    contact_email VARCHAR(100)  NOT NULL,
    phone         VARCHAR(30),
    country       CHAR(2)       NOT NULL DEFAULT 'CO',
    status        ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    origin        ENUM('SELF_SIGNUP', 'PLATFORM_ADMIN') NOT NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_organizations PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Empresa inicial: recibe todos los datos que ya existían
INSERT INTO organizations (id, name, contact_email, status, origin)
VALUES (1, 'Organización inicial',
        COALESCE((SELECT email FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1), 'admin@stockmind.local'),
        'ACTIVE', 'PLATFORM_ADMIN');

-- ── users ────────────────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN organization_id BIGINT NULL AFTER id,
    MODIFY COLUMN role ENUM('PLATFORM_ADMIN', 'ADMIN', 'SELLER') NOT NULL DEFAULT 'SELLER';
UPDATE users SET organization_id = 1;
ALTER TABLE users
    ADD CONSTRAINT fk_users_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP INDEX username,
    ADD UNIQUE KEY uk_users_org_username (organization_id, username);

-- ── categories ───────────────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN organization_id BIGINT NULL AFTER id;
UPDATE categories SET organization_id = 1;
ALTER TABLE categories
    MODIFY COLUMN organization_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_categories_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP INDEX name,
    ADD UNIQUE KEY uk_categories_org_name (organization_id, name);

-- ── products ─────────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN organization_id BIGINT NULL AFTER id;
UPDATE products SET organization_id = 1;
ALTER TABLE products
    MODIFY COLUMN organization_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_products_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP INDEX sku,
    ADD UNIQUE KEY uk_products_org_sku (organization_id, sku);
-- idx_products_sku (sku) queda como índice de búsqueda; este cubre el listado por empresa
CREATE INDEX idx_products_org_name ON products(organization_id, name);

-- ── sales ────────────────────────────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN organization_id BIGINT NULL AFTER id;
UPDATE sales SET organization_id = 1;
ALTER TABLE sales
    MODIFY COLUMN organization_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_sales_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX idx_sales_org_date ON sales(organization_id, created_at);

-- ── inventory_movements ──────────────────────────────────────────────────────
ALTER TABLE inventory_movements ADD COLUMN organization_id BIGINT NULL AFTER id;
UPDATE inventory_movements SET organization_id = 1;
ALTER TABLE inventory_movements
    MODIFY COLUMN organization_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_inv_mov_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX idx_inv_mov_org_date ON inventory_movements(organization_id, created_at);

-- ── demand_predictions (la escribe el servicio de analítica) ─────────────────
ALTER TABLE demand_predictions ADD COLUMN organization_id BIGINT NULL AFTER id;
UPDATE demand_predictions SET organization_id = 1;
ALTER TABLE demand_predictions
    MODIFY COLUMN organization_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_demand_pred_organization FOREIGN KEY (organization_id)
        REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX idx_demand_pred_org ON demand_predictions(organization_id, product_id);
