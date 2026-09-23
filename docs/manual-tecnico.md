# StockMind — Manual Técnico

**Versión:** 1.3.6
**Clasificación:** Documentación técnica interna
**Audiencia:** Desarrolladores, administradores de sistemas

---

## 0. Resumen de cambios desde v1.2.0

Este manual no se actualizaba desde la v1.2.0. Entre esa versión y la actual (v1.3.6) se incorporaron, en orden:

- **v1.3.0** — Rediseño visual (Dark Glass / Glassmorphism) y correcciones en gestión de usuarios.
- **v1.3.1** — Rate limiting realmente activado en el gateway (antes importado pero sin aplicar).
- **v1.3.2** — Cambio de fondo en autenticación: el JWT deja de viajar en el body y de guardarse en `localStorage`; pasa a cookie `httpOnly`. **Esto invalida la sección 4 de la versión anterior del manual** — ver la sección 4 reescrita más abajo.
- **v1.3.5** — Efecto visual **StockMindGlass** (`GlassElement`), aplicado por ahora al botón del agente IA.
- **v1.3.6** — Capa de logging con MongoDB, desacoplada de MySQL (experimental / reto técnico — ver nota de producción en la sección 6).

El resto de este documento ya refleja el sistema tal como queda en v1.3.6, no como estaba en v1.2.0.

---

## 1. Visión general de la arquitectura

StockMind es un sistema distribuido compuesto por componentes independientes que se comunican mediante HTTP/REST. Ningún componente accede directamente a la base de datos de otro; MySQL es el único almacén de datos **de negocio**, accedido por Java (lógica de negocio) y Python (analítica de solo lectura + escritura de predicciones). Desde la v1.3.6, MongoDB se suma como un almacén adicional, pero exclusivamente para logs — no para datos de negocio.

A partir de la v1.2.0, el frontend incorpora un componente de agente IA (`AgentBubble`) que realiza llamadas directas a la API de Groq desde el navegador. Este componente sigue siendo el único que opera fuera del gateway Node.js.

```
Frontend React → Gateway Node.js :3000
                     ├── → Java Spring Boot :8080 (lógica de negocio)
                     ├── → Python Flask :8000 (analítica)
                     │              ↓
                     │         MySQL :3306
                     └── → MongoDB :27017 (logs, no bloqueante)

Frontend React → Groq API (externo, solo AgentBubble)
```

### Principio de diseño fundamental

El frontend **nunca** contacta directamente al backend Java ni al microservicio Python. El gateway Node.js es el único punto de entrada del sistema. Esta decisión permite:

- Autenticación centralizada (un solo punto de verificación de JWT)
- Cambiar la implementación interna de cualquier servicio sin afectar el frontend
- Aplicar rate limiting, logging y CORS en un solo lugar
- Evolución independiente de cada servicio

El agente IA sigue siendo la única excepción deliberada a este principio: al ser un componente experimental que consume un servicio externo de terceros (Groq), se integra directamente en el cliente sin pasar por el gateway.

MongoDB **no** es una excepción a este principio en el mismo sentido: sigue centralizada en el gateway (es el único servicio que le escribe), pero es una rama paralela sin efecto en el flujo de negocio — si Mongo no respondiera durante una petición ya en curso, esa petición no se ve afectada (ver sección 2.2).

---

## 2. Descripción de cada servicio

### 2.1 Frontend (React 18 + Vite)

**Tipo:** Single Page Application
**Tecnología:** React 18, Vite, React Router DOM 6
**Puerto de desarrollo:** 5173
**Comunicación:** Solo HTTP hacia `http://localhost:3000/api` (gateway), con cookies incluidas (`credentials: 'include'`), excepto `AgentBubble` que llama directamente a Groq

El frontend utiliza el módulo `api.js` como cliente HTTP centralizado. Todas las rutas pasan por `API.{modulo}.{operacion}()`.

> **Cambio importante (v1.3.2):** el frontend ya **no** maneja el JWT directamente. No se lee ni se guarda en `localStorage`, y no se inyecta ningún header `Authorization` manualmente — el navegador envía la cookie `httpOnly` automáticamente en cada request al gateway. `AuthContext` restaura la sesión llamando a `GET /api/auth/me` al montar la aplicación, y solo mantiene en memoria el objeto `{ user }` (no el token).

**Páginas y componentes principales:**

| Archivo | Módulo |
|---------|--------|
| `pages/Login.jsx` | Autenticación |
| `pages/Dashboard.jsx` | Resumen general |
| `pages/Products.jsx` | CRUD de productos |
| `pages/Inventory.jsx` | Movimientos de inventario |
| `pages/Sales.jsx` | Registro y consulta de ventas |
| `pages/Reports.jsx` | Reportes de ventas |
| `pages/Predictions.jsx` | Predicciones y recomendaciones |
| `pages/Users.jsx` | Gestión de usuarios (solo Admin) |
| `components/layout/Sidebar.jsx` | Navegación lateral con NavLink |
| `components/ui/GlassElement.jsx` | Base visual **StockMindGlass** (refracción/blur vía `backdrop-filter` + mapas de desplazamiento SVG) — v1.3.5 |
| `components/ui/AgentBubble.jsx` | Agente IA conversacional (experimental); usa `GlassElement` en su botón flotante desde v1.3.5 |
| `context/AuthContext.jsx` | Estado global de sesión (`{ user }`), restaurado vía `/api/auth/me` |
| `hooks/useToast.js` | Sistema de notificaciones |

**Protección de rutas:**
`ProtectedLayout` verifica el estado de sesión resuelto por `AuthContext` (a partir de `/api/auth/me`) en cada render. Si no hay sesión válida, redirige a `/` (login). Las rutas específicas por rol se controlan en cada página individualmente.

---

### 2.2 API Gateway (Node.js + Express)

**Puerto:** 3000
**Responsabilidades:**
- Verificación de sesión vía cookie `httpOnly` antes de cada petición protegida
- Enrutamiento transparente hacia Java o Python según el módulo
- CORS (con `credentials: true` y origin explícito, requerido para cookies cross-port), rate limiting, logging a consola (Morgan) y a MongoDB
- Manejo unificado de errores (incluyendo servicios no disponibles)

**Lógica de enrutamiento:**
- `/api/auth/**` → Java :8080
- `/api/users/**` → Java :8080
- `/api/products/**` → Java :8080
- `/api/inventory/**` → Java :8080
- `/api/sales/**` → Java :8080
- `/api/reports/**` → Java :8080
- `/api/predictions/**` → **Python :8000** ← único módulo que va a Python

El gateway actúa como proxy sin estado; no persiste datos de negocio propios. Desde v1.3.6, sí persiste **metadatos de logging** (no datos de negocio) en MongoDB.

**Rate limiting (activado en v1.3.1):**

| Limitador | Alcance | Límite |
|-----------|---------|--------|
| `authLimiter` | `POST /api/auth/login` | 10 intentos / 15 min por IP (mitiga fuerza bruta) |
| `apiLimiter` | Resto de `/api` | 600 peticiones / 5 min en producción · 5000 / 5 min en desarrollo |

`apiLimiter` identifica por `req.user.id` cuando hay sesión, con fallback a IP. Nota interna: como la verificación de sesión ocurre dentro de cada archivo de rutas y no antes de este middleware, en la práctica `req.user` aún no existe al pasar por el limitador general — hoy limita por IP de forma efectiva; reordenar esto es un pendiente conocido.

**Autenticación de cookie (v1.3.2):**
`cookie-parser` lee la cookie `httpOnly` en cada request. El middleware de auth valida el JWT contenido en la cookie y reconstruye el header `Authorization: Bearer <token>` que Java espera, mediante el helper centralizado `utils/authHeader.js` — así esa reconstrucción vive en un solo lugar en vez de repetirse en cada archivo de rutas.

**Logging a MongoDB (v1.3.6):**
El middleware `mongoLogger` (`src/middleware/mongoLogger.middleware.js`) registra cada request en la colección `logs` de MongoDB (método, ruta, status code, IP, tiempo de respuesta), usando el cliente centralizado en `db/mongo.js`. La escritura ocurre en `res.on('finish')`, **después** de que la respuesta ya fue enviada al cliente — nunca la retrasa. Si la escritura falla, se captura y se registra por consola; no interrumpe la petición.

El servidor (`server.js`) espera la conexión a MongoDB **antes** de aceptar tráfico: si Mongo no responde al arrancar, el proceso no levanta (`process.exit(1)`). Esto es deliberado — se prefiere fallar rápido y visible en el arranque, a levantar "a medias" sin logging y descubrirlo horas después.

**Variables de entorno requeridas (gateway/.env):**
```env
PORT=3000
JAVA_API_URL=http://localhost:8080
PYTHON_API_URL=http://localhost:8000
JWT_SECRET=<igual_al_configurado_en_java>
NODE_ENV=development
MONGO_URI=mongodb://root:root@localhost:27017/stockmind_logs?authSource=admin
```
> Al correr vía `docker compose`, `MONGO_URI` apunta al nombre del servicio interno (`mongo`), no a `localhost`.

---

### 2.3 Backend Java (Spring Boot)

**Puerto:** 8080
**Framework:** Spring Boot 3.x con Spring Security, Spring Data JPA
**Base de datos:** MySQL 8 vía JDBC/Hibernate

Sin cambios funcionales desde v1.2.0. Sigue recibiendo el header `Authorization: Bearer <token>` en cada request protegida — lo único que cambió es *quién* arma ese header (antes el frontend directamente, ahora el gateway a partir de la cookie; ver 2.2).

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

**Configuración requerida (backend/src/main/resources/application.properties):**
Copiar `application.properties.example` como `application.properties` y completar credenciales locales. Este archivo está excluido del repositorio.

---

### 2.4 Microservicio Python (Flask)

**Puerto:** 8000
**Framework:** Flask 3.x
**Dependencias clave:** pandas, numpy, scikit-learn, mysql-connector-python

Sin cambios desde v1.2.0.

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

**Configuración requerida (analytics/config.py):**
Copiar `config.py.example` como `config.py` y completar credenciales locales. Este archivo está excluido del repositorio.

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

### 2.5 Agente IA — AgentBubble (experimental)

**Tipo:** Componente React del frontend
**Motor:** Groq API — modelo `llama-3.3-70b-versatile`
**Comunicación:** Llamadas directas desde el navegador a `https://api.groq.com/openai/v1/chat/completions`

El agente es un componente flotante (FAB) integrado en `ProtectedLayout` del frontend. Opera de forma completamente independiente al gateway y a los servicios internos; no requiere sesión ni accede a MySQL o MongoDB.

**Características:**
- Contexto dinámico por módulo: el system prompt incluye el módulo activo del usuario
- Chips de sugerencias específicos por ruta (`/dashboard`, `/products`, `/sales`, etc.)
- Detección de estado online/offline mediante ping al iniciar el panel
- Historial de conversación limitado a los últimos 10 mensajes por sesión (no persiste)
- Mensajes de error diferenciados: cuota agotada, API key inválida, error de red
- **Desde v1.3.5:** el botón flotante usa el efecto visual **StockMindGlass** (`GlassElement`) — refracción y desenfoque sutil sobre el fondo oscuro, con ligera ampliación y elevación al pasar el cursor. `GlassElement` queda preparado como base reutilizable para aplicar el mismo efecto en otros componentes de la interfaz.

**Configuración:**
```env
# frontend/.env
VITE_GROQ_API_KEY=tu_api_key_aqui
```

```jsx
// App.jsx — dentro de ProtectedLayout
<AgentBubble geminiApiKey={import.meta.env.VITE_GROQ_API_KEY} />
```

> La API key de Groq se obtiene gratuitamente en [console.groq.com](https://console.groq.com). Si no se configura, el agente muestra estado "sin conexión" sin afectar el resto del sistema.

**Limitaciones conocidas:**
- Sin acceso a datos en tiempo real del backend
- Sin persistencia de historial entre sesiones
- La API key queda expuesta en el bundle del cliente si no se maneja con un proxy backend (pendiente)

---

## 3. Base de datos

### 3.1 MySQL — datos de negocio

**Motor:** MySQL 8.x
**Encoding:** utf8mb4 (soporte completo Unicode)
**Base de datos:** `stockmind_db`

**Tablas y relaciones:**

| Tabla | Descripción | Relaciones |
|-------|-------------|------------|
| `users` | Usuarios del sistema | → sales, inventory_movements |
| `categories` | Clasificación de productos | → products |
| `products` | Catálogo de productos | → sale_details, inventory_movements, demand_predictions |
| `sales` | Cabecera de ventas | → sale_details |
| `sale_details` | Líneas de cada venta | ← sales, products |
| `inventory_movements` | Ledger de movimientos | ← products, users |
| `demand_predictions` | Historial de predicciones | ← products |

**Integridad referencial:**
Todas las foreign keys usan `ON DELETE RESTRICT` (excepto `sale_details` que usa `CASCADE`) para preservar la integridad histórica. No se eliminan registros de productos si tienen ventas o movimientos asociados.

**Índices:**
Definidos en `schema.sql` sobre columnas de alta frecuencia de consulta:
- `products.sku` — búsquedas por código
- `products(stock_current, stock_minimum)` — alertas de stock bajo
- `sales.created_at` — filtros por fecha en reportes
- `inventory_movements.product_id` — historial por producto

### 3.2 MongoDB — logs (v1.3.6, experimental)

**Motor:** MongoDB 7.x
**Base de datos:** `stockmind_logs`
**Colección:** `logs`

MongoDB se introdujo como capa de logging **separada** del modelo relacional, siguiendo un patrón de persistencia políglota: MySQL sigue siendo la única fuente de verdad para datos de negocio; Mongo solo guarda trazabilidad operativa del gateway (requests, status codes, errores). Ningún módulo funcional lee de esta colección — es de solo escritura desde el punto de vista de la aplicación.

**Esquema del documento:**
```js
{
  timestamp: ISODate,
  service: "gateway",
  level: "info" | "warn" | "error",   // derivado de statusCode
  method: "GET",
  route: "/api/products/123",
  statusCode: 404,
  userId: ObjectId | null,
  ip: "192.168.1.10",
  responseTimeMs: 42
}
```

**Estado actual — pendientes conocidos:**
- No tiene índices propios todavía. Se recomienda, antes de cualquier uso más allá de pruebas, agregar: un índice TTL sobre `timestamp` (para expirar logs viejos automáticamente) y un índice compuesto sobre `{route: 1, statusCode: 1}` para consultas de errores por ruta.
- No hay rotación ni límite de tamaño configurado en el contenedor.
- Solo el gateway escribe en Mongo; Java y Python no tienen cliente propio — sus errores llegan a Mongo indirectamente, solo si terminan reflejados en la respuesta HTTP que pasa por el gateway.

---

## 4. Autenticación y autorización (reescrito — v1.3.2)

> Esta sección reemplaza por completo el flujo de la v1.2.0, que se basaba en JWT en `localStorage` + header `Authorization` manejado por el frontend. Ese flujo ya no aplica.

### Flujo de autenticación

```
1. Frontend → POST /api/auth/login {username, password}  (credentials: 'include')
2. Gateway → POST :8080/auth/login (Java — ruta pública, sin validar sesión)
3. Java: BCrypt.matches(password, passwordHash) → true
4. Java: JwtConfig.generateToken(user) → "eyJhbGci..." → Java → Gateway
5. Gateway: setea el JWT como cookie httpOnly (no lo incluye en el body)
6. Gateway → Frontend: { user: { id, username, role } }
7. Frontend: AuthContext guarda { user } en memoria — nada en localStorage
```

### Restauración de sesión

```
Frontend (al montar la app) → GET /api/auth/me  (la cookie va automática)
Gateway: valida la cookie → responde { user } si es válida, 401 si no hay sesión
AuthContext: distingue este 401 "esperado" (sin sesión aún) de un 401 de sesión
             caída en medio del uso, para no generar un loop de recarga
```

### Flujo de request protegida

```
1. Navegador envía la cookie httpOnly automáticamente (no hay código del
   frontend involucrado en esto)
2. Gateway (cookie-parser + auth.middleware.js):
   a. Lee el JWT desde req.cookies
   b. jwt.verify(token, JWT_SECRET) → payload { id, username, role }
   c. Adjunta req.user = payload
   d. utils/authHeader.js reconstruye "Authorization: Bearer <token>"
3. Gateway verifica rol si aplica (requireRole('ADMIN'))
4. Gateway reenvía a Java con ese header Authorization reconstruido
5. Java JwtAuthFilter repite la validación (doble verificación, sin cambios)
```

### Cierre de sesión

```
Frontend → POST /api/auth/logout
Gateway: limpia la cookie del lado del servidor (Set-Cookie con expiración pasada)
```

### CORS (necesario para que las cookies viajen)

Con cookies `httpOnly`, el `origin` de CORS ya **no puede ser `'*'`** — debe ser el dominio exacto del frontend, y `credentials: true` es obligatorio en ambos lados (servidor y cliente) para que el navegador envíe y acepte la cookie entre `localhost:5173` (frontend) y `localhost:3000` (gateway).

### Clave JWT compartida

El secreto JWT debe seguir siendo **idéntico** en el gateway Node.js (`JWT_SECRET` en `gateway/.env`) y en el backend Java (`jwt.secret` en `application.properties`). Esto no cambió con el paso a cookies — lo único que cambió es dónde vive el token en tránsito, no cómo se firma ni se valida.

---

## 5. Manejo de errores

Sin cambios desde v1.2.0.

### Códigos de respuesta estándar

| Código | Situación |
|--------|-----------|
| 200 | OK — operación exitosa |
| 201 | Creado — recurso persistido |
| 400 | Error de validación o negocio (stock insuficiente, SKU duplicado, etc.) |
| 401 | Sesión ausente, inválida o expirada |
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

> Todo error que pase por el gateway queda además reflejado como documento en la colección `logs` de MongoDB (sección 3.2), vía `mongoLogger`.

---

## 6. Configuración de entornos

### Archivos de configuración excluidos del repositorio

| Archivo | Ubicación | Plantilla disponible |
|---------|-----------|----------------------|
| `application.properties` | `backend/src/main/resources/` | `application.properties.example` |
| `config.py` | `analytics/` | `config.py.example` |
| `.env` | `gateway/` | Documentado en sección 2.2 (incluye `MONGO_URI` desde v1.3.6) |
| `.env` | `frontend/` | Documentado en sección 2.5 |

Copiar cada plantilla `.example`, renombrarla sin la extensión `.example` y completar los valores locales antes de ejecutar el sistema.

### Desarrollo local

Dos formas de correr el sistema:
- **Manual:** cada servicio en su propia terminal (`mvn spring-boot:run`, `python app.py`, `npm start`, `npm run dev`), con MySQL y MongoDB corriendo localmente o vía contenedores sueltos.
- **Docker Compose (recomendado desde que se agregó MongoDB):** `docker compose up --build` levanta mysql, mongo, backend, analytics, gateway y frontend juntos, con la red y las variables de entorno entre servicios ya resueltas.

### Producción (consideraciones)

- Cambiar `JWT_SECRET` a un valor criptográficamente seguro (mínimo 256 bits)
- Configurar `spring.jpa.hibernate.ddl-auto=none` (no modificar schema en producción)
- Usar variables de entorno reales, no archivos `.env` versionados
- Restringir `cors.allowed-origins` al dominio real del frontend (obligatorio ahora que se depende de cookies — ver sección 4)
- Usar `gunicorn` para el microservicio Python en lugar del servidor de desarrollo Flask
- Configurar HTTPS en todos los servicios o usar un reverse proxy (nginx); las cookies `httpOnly` deberían marcarse `Secure` en producción
- Para el agente IA: mover la API key de Groq a un endpoint proxy en el gateway para no exponerla en el cliente
- **MongoDB (abierto a evaluación):** la integración actual es exploratoria — se construyó para validar el patrón, no como decisión definitiva de producción. Antes de llevarla a producción vale la pena evaluar: credenciales fuera de `root/root`, un servicio Mongo gestionado (Atlas u otro) en vez de un contenedor propio, política real de retención/TTL de logs, y si el caso de uso no queda mejor cubierto por una solución de logging dedicada (ej. stack tipo ELK) en vez de una base de datos de propósito general.

---

## 7. Dependencias y versiones

### Node.js Gateway
```json
"axios": "^1.6.0",
"cookie-parser": "^1.4.6",
"cors": "^2.8.5",
"dotenv": "^16.3.1",
"express": "^4.18.2",
"express-rate-limit": "^7.1.5",
"jsonwebtoken": "^9.0.2",
"mongodb": "^7.2.0",
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

### Frontend React
```json
"react": "^18.x",
"react-dom": "^18.x",
"react-router-dom": "^6.x",
"vite": "^8.x"
```

### Infraestructura
```
mysql: 8.0
mongo: 7
```

---

## 8. Estructura de paquetes Java

Sin cambios desde v1.2.0.

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

## 9. Estructura de archivos del Gateway (nuevo)

No existía como sección propia en la v1.2.0 del manual; se agrega dado el crecimiento del gateway desde entonces.

```
gateway/
├── package.json
├── server.js                          # Espera conexión a Mongo antes de app.listen()
├── .env
├── db/
│   └── mongo.js                       # Cliente MongoDB centralizado (v1.3.6)
└── src/
    ├── config/config.js
    ├── middleware/
    │   ├── auth.middleware.js         # Verifica cookie httpOnly (v1.3.2)
    │   ├── logger.middleware.js
    │   ├── mongoLogger.middleware.js  # Log de requests a MongoDB (v1.3.6)
    │   └── errorHandler.middleware.js
    ├── utils/
    │   └── authHeader.js              # Reconstruye Authorization hacia Java (v1.3.2)
    └── routes/
        ├── auth.routes.js
        ├── products.routes.js
        ├── inventory.routes.js
        ├── sales.routes.js
        ├── users.routes.js
        ├── reports.routes.js
        └── predictions.routes.js
```

---

*StockMind v1.3.6 — Manual Técnico — Proyecto Académico*