-- =============================================================================
-- StockMind — Datos iniciales (seed)
-- Incluye: usuario admin, categorías de ejemplo y productos de prueba
-- Contraseña admin: admin123 (hash BCrypt)
-- =============================================================================

USE stockmind_db;

-- =============================================================================
-- Usuarios iniciales
-- Password: admin123 (BCrypt hash)
-- =============================================================================
INSERT INTO users (username, email, password_hash, role, active) VALUES
('admin', 'admin@stockmind.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ADMIN', TRUE),
('vendedor1', 'vendedor1@stockmind.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SELLER', TRUE);

-- =============================================================================
-- Categorías de productos
-- =============================================================================
INSERT INTO categories (name, description) VALUES
('Electrónica', 'Dispositivos electrónicos y accesorios tecnológicos'),
('Oficina', 'Papelería, insumos y equipos de oficina'),
('Alimentos', 'Productos alimenticios no perecederos'),
('Limpieza', 'Productos de aseo e higiene'),
('Herramientas', 'Herramientas manuales y eléctricas');

-- =============================================================================
-- Productos de ejemplo con stock inicial
-- =============================================================================
INSERT INTO products (category_id, name, sku, description, price, stock_current, stock_minimum, unit) VALUES
-- Electrónica
(1, 'Mouse Inalámbrico Logitech M185', 'ELEC-001', 'Mouse compacto inalámbrico con receptor USB nano', 45000.00, 25, 5, 'UNIT'),
(1, 'Teclado USB Genius SlimStar', 'ELEC-002', 'Teclado alámbrico delgado de bajo perfil', 38000.00, 15, 5, 'UNIT'),
(1, 'Audífonos Bluetooth JBL T450BT', 'ELEC-003', 'Audífonos inalámbricos con cancelación de ruido básica', 120000.00, 8, 3, 'UNIT'),
(1, 'Cable HDMI 2m', 'ELEC-004', 'Cable HDMI 2.0 de alta velocidad, 2 metros', 18000.00, 40, 10, 'UNIT'),
(1, 'Hub USB-C 7 puertos', 'ELEC-005', 'Hub multifunción USB-C con HDMI, USB 3.0 y lector SD', 85000.00, 12, 3, 'UNIT'),

-- Oficina
(2, 'Resma Papel Carta 500 hojas', 'OFIC-001', 'Papel bond blanco 75g/m² tamaño carta', 12000.00, 80, 20, 'UNIT'),
(2, 'Bolígrafo BIC Cristal x12', 'OFIC-002', 'Caja de 12 bolígrafos punto medio azul', 8500.00, 50, 15, 'BOX'),
(2, 'Carpeta Archivadora AZ', 'OFIC-003', 'Carpeta metálica con palanca, lomo 7cm', 14000.00, 30, 8, 'UNIT'),
(2, 'Calculadora Casio MX-8B', 'OFIC-004', 'Calculadora de escritorio 8 dígitos', 22000.00, 10, 3, 'UNIT'),
(2, 'Marcadores permanentes x5', 'OFIC-005', 'Set de marcadores Sharpie colores básicos', 15000.00, 25, 8, 'BOX'),

-- Alimentos
(3, 'Café Sello Rojo 500g', 'ALIM-001', 'Café molido tradicional colombiano', 18000.00, 35, 10, 'UNIT'),
(3, 'Azúcar blanca 1kg', 'ALIM-002', 'Azúcar refinada empaque por kilo', 4500.00, 60, 20, 'KG'),
(3, 'Agua Cristal 600ml', 'ALIM-003', 'Agua mineral natural botella individual', 2500.00, 120, 30, 'UNIT'),
(3, 'Galletas Oreo paquete x6', 'ALIM-004', 'Mini paquetes galletas surtidas', 3800.00, 45, 15, 'UNIT'),

-- Limpieza
(4, 'Jabón de manos 500ml', 'LIMP-001', 'Jabón líquido antibacterial fragancia lavanda', 9500.00, 28, 8, 'UNIT'),
(4, 'Desinfectante multiusos 1L', 'LIMP-002', 'Limpiador desinfectante concentrado', 14000.00, 20, 5, 'LT'),
(4, 'Papel higiénico x12', 'LIMP-003', 'Papel higiénico doble hoja, paquete 12 rollos', 28000.00, 15, 5, 'UNIT'),

-- Herramientas
(5, 'Destornillador multifunción', 'HERR-001', 'Set 6 puntas intercambiables con mango ergonómico', 25000.00, 18, 5, 'UNIT'),
(5, 'Cinta de enmascarar 18mm', 'HERR-002', 'Cinta adhesiva papel para pintura y uso general', 4800.00, 40, 12, 'UNIT'),
(5, 'Exacto profesional', 'HERR-003', 'Cuchilla retráctil con repuestos incluidos', 12000.00, 22, 6, 'UNIT');

-- =============================================================================
-- Movimientos de inventario iniciales (entradas por compra inicial)
-- =============================================================================
INSERT INTO inventory_movements (product_id, user_id, type, quantity, reason, stock_before, stock_after)
SELECT id, 1, 'ENTRY', stock_current, 'Stock inicial de apertura', 0, stock_current
FROM products;

-- =============================================================================
-- Ventas de ejemplo para el historial de predicción
-- (Últimos 60 días simulados)
-- =============================================================================

-- Venta 1 - hace 45 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(2, 101000.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 45 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(1, 1, 1, 45000.00, 45000.00),
(1, 6, 3, 12000.00, 36000.00),
(1, 11, 1, 18000.00, 18000.00),
(1, 13, 1, 2500.00, 2500.00);

-- Venta 2 - hace 38 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(2, 87500.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 38 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(2, 2, 1, 38000.00, 38000.00),
(2, 7, 2, 8500.00, 17000.00),
(2, 15, 2, 9500.00, 19000.00),
(2, 13, 5, 2500.00, 12500.00);

-- Venta 3 - hace 30 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(1, 195000.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 30 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(3, 3, 1, 120000.00, 120000.00),
(3, 4, 2, 18000.00, 36000.00),
(3, 6, 2, 12000.00, 24000.00),
(3, 11, 1, 18000.00, 18000.00) -- incluyendo corrección del total aproximado
;

-- Venta 4 - hace 21 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(2, 63500.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 21 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(4, 6, 3, 12000.00, 36000.00),
(4, 7, 2, 8500.00, 17000.00),
(4, 13, 4, 2500.00, 10000.00);

-- Venta 5 - hace 14 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(2, 148000.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 14 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(5, 1, 2, 45000.00, 90000.00),
(5, 8, 2, 14000.00, 28000.00),
(5, 16, 2, 14000.00, 28000.00); -- aprox

-- Venta 6 - hace 7 días
INSERT INTO sales (user_id, total, status, created_at) VALUES
(2, 77000.00, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY));

INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) VALUES
(6, 11, 2, 18000.00, 36000.00),
(6, 15, 2, 9500.00, 19000.00),
(6, 13, 8, 2500.00, 20000.00),
(6, 14, 1, 3800.00, 3800.00); -- aprox

-- Actualización de movimientos por ventas de ejemplo
INSERT INTO inventory_movements (product_id, user_id, type, quantity, reason, stock_before, stock_after, reference_id)
VALUES
(1, 2, 'SALE', -1, 'Venta #1', 26, 25, 1),
(6, 2, 'SALE', -3, 'Venta #1', 83, 80, 1),
(11, 2, 'SALE', -1, 'Venta #1', 36, 35, 1),
(13, 2, 'SALE', -1, 'Venta #1', 121, 120, 1);
