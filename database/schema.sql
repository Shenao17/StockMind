-- =============================================================================
-- StockMind — Script de creación de base de datos
-- Base de datos: stockmind_db
-- Motor: MySQL 8.x
-- Descripción: Schema completo con tablas, relaciones, índices y restricciones
-- =============================================================================

CREATE DATABASE IF NOT EXISTS stockmind_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE stockmind_db;

-- =============================================================================
-- TABLA: users
-- Descripción: Usuarios del sistema con roles y estado de activación
-- =============================================================================
CREATE TABLE users (
    id            BIGINT        NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    email         VARCHAR(100)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    role          ENUM('ADMIN', 'SELLER') NOT NULL DEFAULT 'SELLER',
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- TABLA: categories
-- Descripción: Categorías de productos para clasificación y filtrado
-- =============================================================================
CREATE TABLE categories (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    name        VARCHAR(80)  NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_categories PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- TABLA: products
-- Descripción: Catálogo de productos con información de stock e inventario
-- =============================================================================
CREATE TABLE products (
    id            BIGINT         NOT NULL AUTO_INCREMENT,
    category_id   BIGINT         NOT NULL,
    name          VARCHAR(150)   NOT NULL,
    sku           VARCHAR(50)    NOT NULL UNIQUE,
    description   TEXT,
    price         DECIMAL(12, 2) NOT NULL,
    stock_current INT            NOT NULL DEFAULT 0,
    stock_minimum INT            NOT NULL DEFAULT 5,
    unit          VARCHAR(20)    NOT NULL DEFAULT 'UNIT',  -- UNIT, KG, LT, BOX
    active        BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_products PRIMARY KEY (id),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id)
        REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_price_positive CHECK (price >= 0),
    CONSTRAINT chk_stock_non_negative CHECK (stock_current >= 0),
    CONSTRAINT chk_stock_minimum_positive CHECK (stock_minimum >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_low_stock ON products(stock_current, stock_minimum);

-- =============================================================================
-- TABLA: sales
-- Descripción: Cabecera de ventas realizadas por usuarios del sistema
-- =============================================================================
CREATE TABLE sales (
    id         BIGINT         NOT NULL AUTO_INCREMENT,
    user_id    BIGINT         NOT NULL,
    total      DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    status     ENUM('COMPLETED', 'CANCELLED', 'PENDING') NOT NULL DEFAULT 'COMPLETED',
    notes      VARCHAR(255),
    created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_sales PRIMARY KEY (id),
    CONSTRAINT fk_sales_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_date ON sales(created_at);
CREATE INDEX idx_sales_status ON sales(status);

-- =============================================================================
-- TABLA: sale_details
-- Descripción: Detalle de productos incluidos en cada venta
-- =============================================================================
CREATE TABLE sale_details (
    id          BIGINT         NOT NULL AUTO_INCREMENT,
    sale_id     BIGINT         NOT NULL,
    product_id  BIGINT         NOT NULL,
    quantity    INT            NOT NULL,
    unit_price  DECIMAL(12, 2) NOT NULL,
    subtotal    DECIMAL(14, 2) NOT NULL,
    CONSTRAINT pk_sale_details PRIMARY KEY (id),
    CONSTRAINT fk_sale_details_sale FOREIGN KEY (sale_id)
        REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sale_details_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_unit_price_positive CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sale_details_sale ON sale_details(sale_id);
CREATE INDEX idx_sale_details_product ON sale_details(product_id);

-- =============================================================================
-- TABLA: inventory_movements
-- Descripción: Registro histórico de todos los movimientos de inventario
--              Incluye: entradas manuales, salidas, ventas y ajustes
-- =============================================================================
CREATE TABLE inventory_movements (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    product_id   BIGINT       NOT NULL,
    user_id      BIGINT       NOT NULL,
    type         ENUM('ENTRY', 'EXIT', 'SALE', 'ADJUSTMENT', 'RETURN') NOT NULL,
    quantity     INT          NOT NULL,         -- Positivo: entrada, Negativo: salida
    reason       VARCHAR(255),
    stock_before INT          NOT NULL,
    stock_after  INT          NOT NULL,
    reference_id BIGINT,                        -- ID de venta relacionada (si aplica)
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_inventory_movements PRIMARY KEY (id),
    CONSTRAINT fk_inv_mov_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_inv_mov_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_inv_mov_product ON inventory_movements(product_id);
CREATE INDEX idx_inv_mov_date ON inventory_movements(created_at);
CREATE INDEX idx_inv_mov_type ON inventory_movements(type);

-- =============================================================================
-- TABLA: demand_predictions
-- Descripción: Predicciones de demanda generadas por el microservicio Python
--              Se almacenan para histórico y comparación con demanda real
-- =============================================================================
CREATE TABLE demand_predictions (
    id                  BIGINT         NOT NULL AUTO_INCREMENT,
    product_id          BIGINT         NOT NULL,
    period_type         ENUM('WEEKLY', 'MONTHLY') NOT NULL,
    period_label        VARCHAR(20)    NOT NULL,     -- Ej: "2024-W03", "2024-03"
    predicted_quantity  DECIMAL(10, 2) NOT NULL,
    confidence          DECIMAL(5, 4),               -- Valor entre 0 y 1 (R²)
    model_used          VARCHAR(50),                 -- 'linear_regression', 'moving_avg'
    recommendation      INT,                         -- Cantidad sugerida a reabastecer
    generated_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_demand_predictions PRIMARY KEY (id),
    CONSTRAINT fk_demand_pred_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_demand_pred_product ON demand_predictions(product_id);
CREATE INDEX idx_demand_pred_period ON demand_predictions(period_type, period_label);
