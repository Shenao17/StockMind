# StockMind — Manual Técnico

**Versión:** 1.0.0  
**Clasificación:** Documentación técnica interna  
**Audiencia:** Desarrolladores, administradores de sistemas

---

## 1. Visión general de la arquitectura

StockMind es un sistema distribuido compuesto por cuatro componentes independientes que se comunican mediante HTTP/REST. Ningún componente accede directamente a la base de datos de otro; MySQL es el único almacén de datos compartido, accedido por Java (lógica de negocio) y Python (analítica de solo lectura + escritura de predicciones).

```
Frontend (estático) → Gateway Node.js :3000
                          ├── → Java Spring Boot :8080 (lógica de negocio)
                          └── → Python Flask :8000 (analítica)
                                    ↓
                               MySQL :3306
```

### Principio de diseño fundamental

El frontend **nunca** contacta directamente al backend Java ni al microservicio Python. El gateway Node.js es el único punto de entrada del sistema. Esta decisión permite:

- Autenticación centralizada (un solo punto de verificación de JWT)
- Cambiar la implementación interna de cualquier servicio sin afectar el frontend
- Aplicar rate limiting, logging y CORS en un solo lugar
- Evolución independiente de cada servicio

---

## 2. Descripción de cada servicio

### 2.1 Frontend (HTML/CSS/JavaScript)

**Tipo:** Aplicación estática  
**Tecnología:** HTML5, CSS3, JavaScript ES2020 (sin framework)  
**Comunicación:** Solo HTTP hacia `http://localhost:3000/api`

El frontend utiliza el módulo `api.js` como cliente HTTP centralizado. Todas las rutas pasan por `API.{modulo}.{operacion}()`. El token JWT se lee de `localStorage` y se inyecta automáticamente en cada petición mediante el header `Authorization: Bearer <token>`.

**Páginas:**
| Archivo | Módulo |
|---------|--------|
| `index.html` | Login |
| `dashboard.html` | Resumen general |
| `products.html` | CRUD de productos |
| `inventory.html` | Movimientos de inventario |
| `sales.html` | Registro y consulta de ventas |
| `reports.html` | Reportes de ventas |
| `predictions.html` | Predicciones y recomendaciones |
| `users.html` | Gestión de usuarios (solo Admin) |

---

### 2.2 API Gateway (Node.js + Express)

**Puerto:** 3000  
**Responsabilidades:**
- Verificación de tokens JWT antes de cada petición protegida
- Enrutamiento transparente hacia Java o Python según el módulo
- CORS, rate limiting (100 req/15min por IP), logging (Morgan)
- Manejo unificado de errores (incluyendo servicios no disponibles)

**Lógica de enrutamiento:**
- `/api/auth/**` → Java :8080
- `/api/users/**` → Java :8080
- `/api/products/**` → Java :8080
- `/api/inventory/**` → Java :8080
- `/api/sales/**` → Java :8080
- `/api/reports/**` → Java :8080
- `/api/predictions/**` → **Python :8000** ← único módulo que va a Python

El gateway actúa como proxy sin estado; no persiste datos propios.

**Variables de entorno requeridas (.env):**
```env
PORT=3000
JAVA_API_URL=http://localhost:8080
PYTHON_API_URL=http://localhost:8000
JWT_SECRET=<igual_al_configurado_en_java>
NODE_ENV=development
```

---

### 2.3 Backend Java (Spring Boot)

**Puerto:** 8080  
**Framework:** Spring Boot 3.x con Spring Security, Spring Data JPA  
**Base de datos:** MySQL 8 vía JDBC/Hibernate

**Capas de la aplicación:**

```
Controller → Service → Repository → MySQL
```

| Capa | Responsabilidad |
|------|-----------------|
| Controller | Recibir HTTP, validar body, delegar al Service, retornar ResponseEntity |
| Service | Lógica de negocio, transacciones (@Transactional), validaciones de estado |
| Repository | Consultas JPA, queries JPQL personalizadas |
| Model | Entidades JPA anotadas |
| DTO | Objetos de transferencia para entrada/salida de datos |
| Exception | GlobalExceptionHandler para respuestas de error consistentes |
| Config | SecurityConfig (Spring Security + filtro JWT), JwtConfig |

**Transacción crítica: `SaleService.registerSale()`**

Esta es la operación más sensible del sistema. Ocurre dentro de `@Transactional`:
1. Obtiene el usuario del nombre extraído del JWT
2. Para cada ítem en la lista:
   a. Carga el producto con validación de existencia y activación
   b. Verifica que `stockCurrent >= quantity`
   c. Crea el `SaleDetail` con subtotal calculado
   d. Descuenta el stock: `product.setStockCurrent(stockBefore - quantity)`
   e. Persiste el `InventoryMovement` de tipo `SALE`
3. Persiste la cabecera `Sale` con el total sumado

Si cualquier paso lanza una excepción, el rollback es automático (ACID MySQL).

**Seguridad:**
- `SecurityConfig` configura Spring Security para modo stateless (sin sesión)
- El `JwtAuthFilter` extrae y valida el token en cada request
- `/auth/login` es el único endpoint público
- La autorización por rol (ADMIN vs SELLER) se delega al gateway para no duplicar lógica

---

### 2.4 Microservicio Python (Flask)

**Puerto:** 8000  
**Framework:** Flask 3.x  
**Dependencias clave:** pandas, numpy, scikit-learn, mysql-connector-python

**Justificación de Python como microservicio real:**  
Python no está en el sistema para cumplir un requisito de "usar 4 tecnologías". Está porque las bibliotecas científicas del ecosistema Python (pandas para series temporales, scikit-learn para regresión, numpy para álgebra lineal) no tienen equivalente de madurez ni facilidad de uso en Java ni Node.js para análisis estadístico. Su rol es el único componente del sistema con capacidad predictiva real.

**Módulos internos:**

| Módulo | Rol |
|--------|-----|
| `app.py` | Punto de entrada Flask, registro de blueprints |
| `config.py` | Variables de entorno y parámetros del modelo |
| `src/routes/predictions.py` | Endpoints REST `/predict/<id>` y `/recommend` |
| `src/services/prediction_service.py` | Orquestación: datos → modelo → persistencia |
| `src/services/database_service.py` | Consultas MySQL con mysql-connector |
| `src/models/demand_model.py` | Implementación de WMA y regresión lineal |

**Lógica de selección de modelo en `demand_model.py`:**

```python
if n_weeks >= 4:
    lr_forecast, lr_r2 = linear_regression_forecast(weekly_qty)
    if lr_r2 > 0.3:
        model = "linear_regression"    # Buena tendencia lineal
    else:
        model = "weighted_moving_avg"  # Tendencia baja, usar WMA
else:
    model = "weighted_moving_avg"      # Pocos datos, usar WMA
```

El umbral R² = 0.3 significa: "usa regresión lineal solo si explica al menos el 30% de la varianza de la serie". Por debajo de ese umbral, la media móvil ponderada es más confiable.

**Fórmula de recomendación de reabastecimiento:**
```
safety_stock = monthly_forecast × SAFETY_STOCK_PCT (default 20%)
recommendation = monthly_forecast + safety_stock - stock_current + stock_minimum
recommendation = max(0, round(recommendation))
```

---

## 3. Base de datos

**Motor:** MySQL 8.x  
**Encoding:** utf8mb4 (soporte completo Unicode)  
**Base de datos:** `stockmind_db`

### 3.1 Tablas y relaciones

| Tabla | Descripción | Relaciones |
|-------|-------------|------------|
| `users` | Usuarios del sistema | → sales, inventory_movements |
| `categories` | Clasificación de productos | → products |
| `products` | Catálogo de productos | → sale_details, inventory_movements, demand_predictions |
| `sales` | Cabecera de ventas | → sale_details |
| `sale_details` | Líneas de cada venta | ← sales, products |
| `inventory_movements` | Ledger de movimientos | ← products, users |
| `demand_predictions` | Historial de predicciones | ← products |

### 3.2 Integridad referencial

Todas las foreign keys usan `ON DELETE RESTRICT` (excepto `sale_details` que usa `CASCADE`) para preservar la integridad histórica. No se eliminan registros de productos si tienen ventas o movimientos asociados.

### 3.3 Índices

Los índices están definidos en `schema.sql` sobre columnas de alta frecuencia de consulta:
- `products.sku` — búsquedas por código
- `products(stock_current, stock_minimum)` — alertas de stock bajo
- `sales.created_at` — filtros por fecha en reportes
- `inventory_movements.product_id` — historial por producto

---

## 4. Autenticación y autorización

### Flujo de autenticación

```
1. Frontend → POST /api/auth/login {username, password}
2. Gateway → POST :8080/auth/login (sin validar JWT — ruta pública)
3. Java: BCrypt.matches(password, passwordHash) → true
4. Java: JwtConfig.generateToken(user) → "eyJhbGci..."
5. Java → Gateway → Frontend: { token, userId, username, role }
6. Frontend: localStorage.setItem('sm_token', token)
```

### Flujo de request protegida

```
1. Frontend envía: Authorization: Bearer eyJhbGci...
2. Gateway auth.middleware.js:
   a. Extrae token del header
   b. jwt.verify(token, JWT_SECRET) → payload { id, username, role }
   c. Adjunta req.user = payload
3. Gateway verifica rol si aplica (requireRole('ADMIN'))
4. Gateway reenvía a Java con el mismo header Authorization
5. Java JwtAuthFilter repite la validación (doble verificación)
```

### Clave JWT compartida

El secreto JWT debe ser **idéntico** en el gateway Node.js (`JWT_SECRET` en `.env`) y en el backend Java (`jwt.secret` en `application.properties`). Si son distintos, el gateway aceptará tokens que Java rechazará, o viceversa.

---

## 5. Manejo de errores

### Códigos de respuesta estándar

| Código | Situación |
|--------|-----------|
| 200 | OK — operación exitosa |
| 201 | Creado — recurso persistido |
| 400 | Error de validación o negocio (stock insuficiente, SKU duplicado, etc.) |
| 401 | Token ausente, inválido o expirado |
| 403 | Rol insuficiente |
| 404 | Recurso no encontrado |
| 503 | Servicio upstream (Java o Python) no disponible |
| 504 | Timeout del servicio upstream |

### Formato de error JSON

Todos los errores retornan:
```json
{
  "error": "Descripción del error",
  "timestamp": "2024-03-15T10:22:00",
  "code": "OPCIONAL_CODE"
}
```

---

## 6. Configuración de entornos

### Desarrollo local

Todos los servicios corren en localhost con puertos por defecto. No se requiere Docker ni infraestructura adicional.

### Producción (consideraciones)

- Cambiar `JWT_SECRET` a un valor criptográficamente seguro (mínimo 256 bits)
- Configurar `spring.jpa.hibernate.ddl-auto=none` (no modificar schema en producción)
- Usar variables de entorno reales, no archivos `.env` versionados
- Restringir `cors.allowed-origins` al dominio real del frontend
- Usar `gunicorn` para el microservicio Python en lugar del servidor de desarrollo Flask
- Configurar HTTPS en todos los servicios o usar un reverse proxy (nginx)

---

## 7. Dependencias y versiones

### Node.js Gateway
```json
"axios": "^1.6.0",
"cors": "^2.8.5",
"express": "^4.18.2",
"express-rate-limit": "^7.1.5",
"jsonwebtoken": "^9.0.2",
"morgan": "^1.10.0"
```

### Java Backend
```xml
spring-boot-starter-parent: 3.2.0
Java: 17 LTS
jjwt: 0.11.5
mysql-connector-j: (managed by Spring Boot)
lombok: (managed by Spring Boot)
```

### Python Analytics
```
flask==3.0.0
flask-cors==4.0.0
mysql-connector-python==8.2.0
pandas==2.1.4
numpy==1.26.2
scikit-learn==1.3.2
```

---

## 8. Estructura de paquetes Java

```
com.stockmind
├── StockmindApplication       # @SpringBootApplication
├── config/
│   ├── JwtConfig              # Generación y validación de JWT
│   └── SecurityConfig         # Spring Security + JwtAuthFilter
├── controller/
│   ├── AuthController         # POST /auth/login, GET /auth/me
│   ├── ProductController      # CRUD /products
│   ├── InventoryController    # GET/POST /inventory/movements
│   ├── SaleController         # GET/POST /sales
│   ├── UserController         # CRUD /users
│   └── ReportController       # GET /reports/sales, /top-products
├── service/
│   ├── AuthService            # Validación de credenciales + generación JWT
│   ├── ProductService         # CRUD + validaciones de negocio
│   └── SaleService            # Registro de ventas con descuento de inventario
├── repository/
│   ├── UserRepository
│   ├── ProductRepository      # findLowStockProducts() JPQL custom
│   ├── CategoryRepository
│   ├── SaleRepository         # sumTotalByPeriod(), findTopProductsByPeriod()
│   └── InventoryMovementRepository
├── model/
│   ├── User                   # Enum Role: ADMIN, SELLER
│   ├── Category
│   ├── Product                # isLowStock()
│   ├── Sale                   # Enum Status: COMPLETED, CANCELLED, PENDING
│   ├── SaleDetail             # calculateSubtotal()
│   └── InventoryMovement      # Enum MovementType: ENTRY, EXIT, SALE, ADJUSTMENT, RETURN
├── dto/
│   ├── LoginRequest / LoginResponse
│   ├── ProductDTO
│   └── SaleDTO
└── exception/
    ├── ResourceNotFoundException
    └── GlobalExceptionHandler
```

---

*StockMind v1.0.0 — Manual Técnico — Proyecto Académico*
