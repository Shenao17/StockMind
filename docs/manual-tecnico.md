# StockMind — Manual Técnico

**Versión:** 1.4.0 (multiempresa)
**Clasificación:** Documentación técnica interna — BlackLabs Dev
**Audiencia:** Desarrolladores, administradores de sistemas

---

## 0. Resumen de cambios desde v1.3.6

La v1.4.0 convierte StockMind de una aplicación de un solo negocio en una plataforma **multiempresa** (SaaS), y endurece su seguridad e infraestructura. En orden:

**Seguridad y estabilidad**
- Secretos fuera del repositorio (`.env`), puertos internos cerrados, usuario de aplicación de MySQL sin privilegios de administrador.
- Roles aplicados también en el backend Java (antes solo en el gateway).
- Ventas: el precio lo fija el servidor, bloqueo pesimista de stock, trazabilidad de movimientos.
- Validación de entradas con DTOs en todos los módulos, errores sin detalles internos, política de contraseñas.

**Calidad**
- Pruebas automáticas en los cuatro servicios y CI (GitHub Actions).
- Migraciones de base de datos con **Flyway**; Hibernate solo valida.
- Paginación y filtros del lado del servidor; resumen de dashboard calculado en la base de datos.
- Gateway endurecido: Helmet, límites de cuerpo, timeouts, logging estructurado (JSON).

**Multiempresa**
- Tabla `organizations` y aislamiento automático por empresa (`@TenantId`).
- Login por **correo**; el token lleva la empresa.
- Servicio de analítica aislado por empresa y autenticado con clave interna.
- Registro de empresas: autoregistro con verificación de correo y prueba gratis, y alta desde el panel de plataforma.

**Planes y suscripciones (Fase 3)**
- Planes (Starter, Pro, Business) con precios + IVA, funciones y límites; suscripción por empresa con prueba gratis, gracia, suspensión y cancelación.
- El plan se aplica en el servidor: modo solo lectura al vencer, bloqueo al suspender, funciones y límites por plan.
- Cobros con una pasarela simulada (intercambiable por una real), enlaces de pago, ciclo diario con avisos de fin de prueba y panel de plataforma con auditoría.

**Eliminado**
- **MongoDB** (solo guardaba logs que nadie leía). Los logs pasan a la salida estándar en JSON.
- `morgan` (reemplazado por `pino-http`).

> Los números de versión internos de cada servicio (gateway 1.0.0, analytics 1.2.0, frontend 0.0.0) no se han alineado con la versión del producto. Es un pendiente menor.

---

## 1. Visión general de la arquitectura

StockMind es un sistema distribuido de servicios independientes que se comunican por HTTP/REST. **MySQL es el único almacén de datos**, accedido por el backend Java (lógica de negocio y esquema) y por el servicio Python (lectura de ventas y escritura de predicciones).

```
Navegador (React :5173)
     │  cookie httpOnly
     ▼
Gateway Node.js :3000 ──► Backend Java Spring Boot :8080 ──► MySQL :3306
     │  (X-Internal-Key + X-Organization-Id)                    ▲
     ├────────────────► Analytics Python Flask :8000 ───────────┘
     └────────────────► Groq API (externo, asistente IA — apagado por ahora)
```

**Solo el gateway (3000) y el frontend (5173) se publican al host.** MySQL, el backend y analytics solo son alcanzables dentro de la red de Docker (en desarrollo, MySQL se publica además en `127.0.0.1:3306` para usar un cliente SQL).

### Principios de diseño

- **El gateway es el único punto de entrada.** Centraliza la autenticación, CORS, límites de frecuencia, tamaño de cuerpo, timeouts y logging.
- **Defensa en profundidad.** El gateway valida sesión y rol, pero el backend Java también valida el JWT y aplica roles; analytics exige una clave interna. Ningún servicio confía ciegamente en que otro ya validó.
- **Aislamiento por empresa en la capa de datos**, no en el código de cada pantalla (sección 3).
- **El frontend nunca habla con Java ni con Python**, y no maneja el JWT: vive solo en una cookie `httpOnly`.

---

## 2. Descripción de cada servicio

### 2.1 Frontend (React + Vite)

**Tecnología:** React 19, Vite 8, React Router 7, Vitest
**Puerto de desarrollo:** 5173
**Comunicación:** solo HTTP hacia el gateway (`VITE_GATEWAY_URL`, por defecto `http://localhost:3000/api`) con `credentials: 'include'`.

`src/api.js` es el cliente HTTP central: `API.{módulo}.{operación}()`. Los listados aceptan un objeto de parámetros (`page`, `size`, `search`, ...) y construyen la query string omitiendo valores vacíos.

| Archivo | Módulo |
|---------|--------|
| `pages/Login.jsx` | Inicio de sesión por **correo electrónico** |
| `pages/VerifyEmail.jsx` | Destino del enlace de verificación de correo (`/verify-email?token=...`) |
| `pages/Billing.jsx` | Plan actual, uso frente a límites, planes con IVA y historial de cobros |
| `pages/Pay.jsx` | Página pública de pago (`/pay/:referencia`) |
| `pages/Platform.jsx` | Panel del dueño de la plataforma: empresas, planes, enlaces de pago, suspensión |
| `context/SubscriptionContext.jsx` + `subscriptionState.js` | Plan de la empresa; alimenta el banner, los candados y la pantalla de bloqueo |
| `components/ui/PlanBanner.jsx`, `FeatureGate.jsx` | Aviso de prueba/vencimiento y pantalla "mejora tu plan" |
| `pages/Dashboard.jsx` | Resumen general (datos de `/api/dashboard/summary`) |
| `pages/Products.jsx` | Catálogo: búsqueda y filtro por categoría en el servidor, paginado |
| `pages/Inventory.jsx` | Movimientos: filtro por tipo, paginado |
| `pages/Sales.jsx` | Punto de venta e historial paginado |
| `pages/Reports.jsx`, `pages/Predictions.jsx` | Reportes y predicciones |
| `pages/Users.jsx` | Usuarios de la empresa (solo ADMIN): búsqueda y paginación |
| `components/ui/Pagination.jsx` | Controles de paginación reutilizables |
| `hooks/useDebounce.js` | Retraso de 300 ms en búsquedas (evita una petición por tecla) |
| `components/ui/AgentBubble.jsx` | Asistente IA (apagado por ahora, ver 2.5) |
| `GlassUi/` | Efecto visual StockMindGlass |
| `context/AuthContext.jsx` | Sesión `{ user }` en memoria, restaurada con `GET /api/auth/me` |

**Sesión:** no se lee ni guarda el token. Si el gateway responde 401 en cualquier llamada (salvo `/auth/me` y `/auth/login`), el cliente limpia la sesión y vuelve al login. Los tokens emitidos antes de la multiempresa (sin empresa) reciben 401 y obligan a iniciar sesión de nuevo.

**Pantallas que aún cargan listas completas** (sin paginar): el catálogo del punto de venta, el selector de producto de Inventario, Predicciones y Reportes. Con catálogos grandes necesitan una solución propia (búsqueda mientras se escribe, por ejemplo).

### 2.2 API Gateway (Node.js + Express)

**Puerto:** 3000. El código se divide en `app.js` (construye la aplicación sin escuchar, para poder probarla) y `server.js` (la arranca).

**Responsabilidades**
- Verificar la sesión (JWT en cookie `httpOnly`) y el rol antes de cada ruta protegida.
- Proxy hacia Java y Python; el JWT se reenvía a Java como `Authorization: Bearer` (`utils/authHeader.js`).
- Seguridad: **Helmet**, CORS por ruta, límite de cuerpo (100 KB), timeouts (15 s a Java/Python, 20 s a Groq), rate limiting (login y códigos 2FA: 10 intentos FALLIDOS por IP cada 15 min, un solo contador compartido; los accesos correctos y las consultas como `mfa/self/status` no cuentan; en desarrollo 100).
- Registro estructurado (`pino`/`pino-http`) y manejo unificado de errores.

**Rutas**

| Prefijo | Destino | Acceso |
|---------|---------|--------|
| `/api/auth/*` | Java | login público; `/me` con sesión |
| `/api/users` | Java | ADMIN |
| `/api/products`, `/api/categories` | Java | lectura: ADMIN/SELLER · escritura de productos: ADMIN |
| `/api/inventory` | Java | lectura: ambos · alta de movimientos: ADMIN |
| `/api/sales` | Java | ADMIN/SELLER |
| `/api/dashboard/summary` | Java | ADMIN/SELLER |
| `/api/reports` | Java | ADMIN |
| `/api/predictions/*` | **Python** | ADMIN/SELLER; exige la función `PREDICTIONS` del plan |
| `/api/agent/*` | Groq | sesión; apagado salvo `AGENT_ENABLED=true` |
| `/api/billing/*` | Java | plan y pagos de la empresa (checkout solo ADMIN); siguen disponibles aunque el plan esté vencido |
| `/api/public/*` | Java | **sin sesión**: registro, verificación, planes y enlaces de pago (ver 5.4 y 6) |
| `/api/platform/*` | Java | solo roles `PLATFORM_*` (el permiso fino lo decide el backend; ver 5.6 y 6.5) |
| `/api/auth/mfa/*` | Java | público salvo `mfa/self/*` (sesión de empresa); el desafío viaja en el cuerpo |
| `/health` | — | público, sin datos internos |

**CORS:** el origen del frontend (`FRONTEND_URL`) con `credentials: true`. La landing (otro dominio, `LANDING_URL`) solo puede llamar a `/api/public/*` y **sin cookies**.

**Rate limiting** (en memoria del proceso; con varias réplicas hará falta un almacén compartido, p. ej. Redis):

| Limitador | Alcance | Límite |
|-----------|---------|--------|
| `authLimiter` | `POST /api/auth/login` | 10 / 15 min por IP |
| `apiLimiter` | resto de `/api` | 600 / 5 min por IP (5000 en desarrollo) |
| Registro | `POST /api/public/registrations` | 5 / hora por IP |
| Reenvío de verificación | `POST /api/public/resend-verification` | 5 / hora por IP |
| Verificación | `POST /api/public/verify-email` | 30 / hora por IP |

Detrás de un proxy inverso hay que definir `TRUST_PROXY` (número de proxies) para que se use la IP real.

**Logging:** una línea JSON por petición a la salida estándar con `X-Request-Id` (reutiliza el del proxy si es válido), método, ruta **sin query string**, estado, duración y `userId`. Nunca registra cookies ni cabeceras de autorización. `/health` no se registra. Los logs no se guardan en ninguna base: queda para la fase de infraestructura decidir dónde recogerlos.

### 2.3 Backend Java (Spring Boot)

**Puerto:** 8080 (solo red interna). **Framework:** Spring Boot 3.2, Spring Security, Spring Data JPA, **Hibernate 6.4** (fijado en el `pom.xml`: Boot 3.2.0 trae 6.3.1, que no permite el identificador de empresa como `Long`), Flyway.

```
Controller → Service → Repository → MySQL
```

| Capa | Responsabilidad |
|------|-----------------|
| Controller | HTTP, validación del cuerpo con `@Valid`, delegar al servicio |
| Service | Lógica de negocio y transacciones |
| Repository | JPA, JPQL y *Specifications* para filtros combinables |
| Model | Entidades JPA |
| DTO | Entrada/salida validadas (`ProductDTO`, `SaleDTO`, `UserDTO`, `InventoryDTO`, `RegistrationDTO`, `PageResponse`) |
| Exception | `GlobalExceptionHandler`: errores consistentes y sin detalles internos |
| Tenant | `TenantContext` y resolución de la empresa para Hibernate |

**Transacciones críticas**
- `SaleService.registerSale`: precio **siempre desde `Product.price`**, producto leído con `SELECT ... FOR UPDATE` (en orden de id, contra deadlocks), validación de stock, movimiento de inventario con el id de la venta; todo en una transacción.
- `InventoryService.registerMovement`: mismo bloqueo; solo `ENTRY`, `EXIT` y `ADJUSTMENT` se registran a mano (`ENTRY` suma; `EXIT` y `ADJUSTMENT` restan; la semántica de `ADJUSTMENT` como "conteo físico" está por definir).
- `RegistrationService`: empresa y primer administrador en una sola transacción; el correo se envía solo si se confirma.

**Paginación (contrato común de los listados)**

`page` (base 0), `size` (1–100, por defecto 20), `sort` (solo campos permitidos por recurso) y `dir` (`asc`|`desc`). Con `page` o `size` la respuesta es `{ content, page, size, totalElements, totalPages }`; sin ellos, el arreglo completo (compatibilidad). Un campo de orden no permitido, `size` fuera de rango o `page` negativa devuelven 400.

| Recurso | Filtros |
|---------|---------|
| `/products` | `search` (nombre o SKU, sin distinguir mayúsculas; `%` y `_` se tratan como texto), `categoryId`, `lowStock` |
| `/sales` | `from`, `to` (yyyy-MM-dd), `status`, `userId` |
| `/inventory/movements` | `productId`, `type`, `from`, `to` |
| `/users` | `search`, `role`, `active` |
| `/platform/organizations` | `search`, `status` (siempre paginado) |

**Endpoints**

| Método y ruta | Rol |
|---------------|-----|
| `POST /auth/login` | público |
| `GET /auth/me` | ADMIN, SELLER |
| `GET /products`, `/products/low-stock`, `/products/{id}`, `GET /categories`, `GET /sales`, `GET /sales/{id}`, `POST /sales`, `GET /inventory/movements`, `GET /dashboard/summary` | ADMIN, SELLER |
| `POST/PUT/DELETE /products`, `POST /inventory/movements`, `/users/**`, `/reports/**` | ADMIN |
| `POST /public/registrations`, `/public/verify-email`, `/public/resend-verification` | público |
| `/platform/**` | permiso `PERM_*` según el rol de plataforma |

Cualquier otra ruta exige ADMIN o SELLER. Un token sin rol válido, o de ADMIN/SELLER sin empresa, no concede nada.

**Dashboard:** `GET /dashboard/summary` devuelve contadores, totales de hoy y del mes, stock crítico y ventas recientes calculados en la base de datos. "Hoy" y "mes" usan el reloj de la JVM (UTC en Docker): una venta a las 7 pm en Bogotá cuenta para el día siguiente. Pendiente de la fase de infraestructura (definir zona horaria).

### 2.4 Microservicio Python (Flask)

**Puerto:** 8000 (solo red interna). **Dependencias:** Flask, pandas, numpy, scikit-learn, mysql-connector-python.

**Autenticación entre servicios.** Analytics no verifica el JWT: confía en el gateway, que envía
- `X-Internal-Key`: clave compartida (`INTERNAL_API_KEY`, ≥ 32 caracteres), comparada en tiempo constante;
- `X-Organization-Id`: empresa tomada del **token ya verificado** (nunca de lo que mande el cliente).

Sin clave válida responde 401; sin empresa válida, 400. Sin `INTERNAL_API_KEY` configurada, el servicio no arranca. **Todas las consultas se limitan a esa empresa**, y una predicción solo se guarda si el producto pertenece a ella. Un producto de otra empresa responde 404. `/health` es público.

| Módulo | Rol |
|--------|-----|
| `app.py` | Punto de entrada; exige `INTERNAL_API_KEY` |
| `src/routes/predictions.py` | `/predict/<id>` y `/recommend`; valida clave y empresa (`before_request`) |
| `src/services/prediction_service.py` | Orquestación: datos → modelo → persistencia |
| `src/services/database_service.py` | Consultas MySQL parametrizadas, siempre con `organization_id` |
| `src/models/demand_model.py` | Media móvil ponderada y regresión lineal |

**Selección de modelo:** con 4 o más semanas de historial se ajusta una regresión lineal y se usa solo si R² > 0,3; si no, media móvil ponderada (también con menos de 4 semanas). Recomendación: `mensual + mensual × 20 % − stock actual + stock mínimo`, con mínimo 0.

**Limitación conocida:** si MySQL no responde, `/predict/<id>` contesta 404 ("producto no encontrado") y `/recommend` una lista vacía, en vez de un 503.

### 2.5 Asistente IA (experimental, apagado)

El asistente consulta Groq (`llama-3.3-70b-versatile`) **desde el gateway** (`/api/agent/*`): la clave de Groq nunca llega al navegador. Usa la sesión del usuario para consultar datos reales de su empresa a través del backend.

Está **apagado por defecto** (`AGENT_ENABLED=false`): el chat muestra un aviso de mejora. Para reactivarlo: `AGENT_ENABLED=true` y `GROQ_API_KEY` en el `.env`, y recrear el gateway. Antes de reactivarlo en producción conviene definir qué datos de la empresa pueden enviarse al proveedor externo.

---

## 3. Multiempresa (tenancy)

Cada empresa cliente es una fila de `organizations`. Todos los datos de negocio (categorías, productos, ventas, movimientos, predicciones) pertenecen a **una** empresa mediante `organization_id`. El modelo es de **base de datos compartida con columna discriminadora**.

### 3.1 Cómo se aplica el aislamiento

1. **Token:** el JWT lleva el claim `org`. El filtro de seguridad (`JwtAuthFilter`) lo coloca en `TenantContext` (un `ThreadLocal`) y lo restaura al terminar la petición.
2. **Hibernate:** las entidades con empresa (`Category`, `Product`, `Sale`, `InventoryMovement`) llevan `@TenantId`. Hibernate añade `organization_id = ?` a cada consulta y rellena la columna al insertar, tomando la empresa de `TenantIdentifierResolver`.
3. **Sin empresa, falla cerrado:** si no hay empresa en el contexto, Hibernate usa `-1`, que no existe: no se lee nada y la clave foránea rechaza cualquier escritura.
4. **Usuarios (`User`)** no usan `@TenantId`: el login debe buscarlos por correo antes de saber la empresa. Se aíslan a mano en `UserController` (`organizationId` en cada filtro; un usuario de otra empresa responde 404).
5. **Tokens sin empresa:** ADMIN y SELLER sin `org` no reciben ninguna autoridad (backend) ni pasan `authenticate` (gateway).

### 3.2 Trampas conocidas (y cómo están cubiertas)

| Trampa | Cobertura |
|--------|-----------|
| `EntityManager.find()` (y por tanto el `findById` heredado) **no aplica** el filtro de empresa → lectura por id de datos ajenos | Cada repositorio con empresa **redeclara `findById` con JPQL**. `TenantArchitectureTest` falla si alguien lo quita |
| Los JOIN implícitos de JPQL no heredan el filtro (reportes) | Las consultas agregadas reciben `organizationId` explícito (`sumTotalByPeriod`, `findTopProductsByPeriod`) |
| El contexto es un `ThreadLocal`: los hilos nuevos no lo heredan | Usar `TenantContext.runAs(orgId, ...)` en ejecutores o tareas asíncronas |
| SQL nativo y `JdbcTemplate` no se filtran | Evitarlos en código de negocio; si hace falta, filtrar a mano y probar el aislamiento |
| Analytics (Python) no usa Hibernate | Clave interna + cabecera de empresa + `organization_id` explícito en cada consulta |

### 3.3 Reglas de unicidad

El SKU de producto, el nombre de categoría y el `username` son únicos **por empresa**. El **correo es único en toda la plataforma** (es el identificador de login).

### 3.4 Añadir una entidad nueva con datos de empresa (lista de verificación)

1. Columna `organization_id BIGINT NOT NULL` con clave foránea a `organizations` en una **migración nueva**.
2. En la entidad: campo `@TenantId @JsonIgnore @Column(name = "organization_id", nullable = false, updatable = false) Long organizationId`.
3. Redeclarar `findById` con `@Query` en su repositorio y añadirlo a `TenantArchitectureTest`.
4. Cualquier JPQL con JOIN o agregado: pasar `organizationId` explícito.
5. Escribir pruebas de aislamiento en `TenantIsolationIntegrationTest` (listado, por id, escritura cruzada, reportes).

### 3.5 Roles

| Rol | Alcance |
|-----|---------|
| `PLATFORM_OWNER` | Dueño de la plataforma. **Sin empresa.** Solo accede a `/platform/**`; no ve datos de negocio de ninguna empresa |
| `PLATFORM_BILLING` / `PLATFORM_SUPPORT` / `PLATFORM_VIEWER` | Equipo de plataforma (cobranza, soporte, consulta). Sin empresa; permisos limitados (ver 5.6 y `docs/PANEL_PLATAFORMA.md`) |
| `ADMIN` | Administrador de **una** empresa: gestiona sus usuarios, productos, inventario y reportes |
| `SELLER` | Vendedor de una empresa: consulta y registra ventas |

Un ADMIN de empresa no puede crear ni asignar un rol de plataforma, y no puede desactivarse, eliminarse ni cambiarse el rol a sí mismo.

---

## 4. Base de datos

### 4.1 MySQL

**Motor:** MySQL 8.0 · **Encoding:** utf8mb4 · **Base:** `stockmind_db`

| Tabla | Descripción |
|-------|-------------|
| `organizations` | Empresas cliente: nombre, NIT (único), contacto, país, estado, origen, fin de prueba, aceptación de términos |
| `users` | Usuarios; `organization_id` es NULL solo para el equipo de plataforma; `email_verified_at`; columnas de 2FA/PIN (V5) |
| `platform_backup_codes` | Códigos de respaldo del 2FA (solo el hash SHA-256; un solo uso) |
| `categories`, `products` | Catálogo de cada empresa |
| `sales`, `sale_details` | Ventas y sus líneas |
| `inventory_movements` | Libro de movimientos de inventario |
| `demand_predictions` | Predicciones (las escribe analytics) |
| `email_verification_tokens` | Hash SHA-256 de los tokens de verificación (nunca el token real) |
| `plans`, `plan_features` | Planes (precios en COP sin IVA, límites) y sus funciones premium |
| `subscriptions` | Una por empresa: plan, estado, ciclo, fechas de prueba/periodo/gracia, cortesía |
| `payments` | Cobros: neto, IVA, total, proveedor, estado y referencia impredecible del enlace de pago |
| `audit_log` | Acciones sensibles del panel de plataforma y de seguridad de las empresas (quién, qué, sobre qué empresa) |
| `flyway_schema_history` | Control de migraciones |

**Estados de empresa:** `PENDING` (sin verificar el correo), `ACTIVE`, `SUSPENDED`, `CANCELLED`. Solo `ACTIVE` puede iniciar sesión. **Origen:** `SELF_SIGNUP` o `PLATFORM_ADMIN` (creada desde el panel).

**Integridad:** claves foráneas con `ON DELETE RESTRICT` (salvo detalles de venta y tokens, que usan `CASCADE`); restricciones `CHECK` de stock no negativo y precios; índices por empresa en las consultas frecuentes.

### 4.2 Migraciones (Flyway)

El esquema lo gestiona **Flyway** desde el backend; Hibernate solo valida (`ddl-auto: validate`) y el arranque falla si una entidad no coincide con la base. MySQL solo crea la base vacía.

| Migración | Contenido |
|-----------|-----------|
| `V1__baseline_schema.sql` | Esquema inicial |
| `V2__organizations_multitenancy.sql` | `organizations`, `organization_id` en todas las tablas, unicidades por empresa, empresa inicial (id 1) con los datos existentes |
| `V3__registration_and_verification.sql` | Verificación de correo, fin de prueba y términos |
| `V4__plans_subscriptions_payments.sql` | Planes (borrador de precios), suscripciones, pagos y auditoría; las empresas existentes quedan con una suscripción de cortesía (Business) |
| `V6__company_mfa.sql` | `organizations.require_mfa`: la empresa exige 2FA a todos sus usuarios |
| `V5__platform_roles_mfa.sql` | Roles de plataforma (`PLATFORM_ADMIN` pasa a `PLATFORM_OWNER`), columnas de 2FA/PIN/sesiones en `users` y `platform_backup_codes` |

- **Una migración aplicada no se edita** (Flyway detecta el cambio por checksum y no arranca): los cambios van en una versión nueva.
- Una base anterior a Flyway se "baselinea" en V1 sin tocar datos (`baseline-on-migrate`), y después aplica V2 y V3. `clean` está deshabilitado.
- **Datos de ejemplo (solo desarrollo):** `DevDataSeeder` carga `db/dev/seed.sql` únicamente con el perfil `dev` y si no hay usuarios. En producción nunca se ejecuta.
- Flyway usa el mismo usuario que la aplicación; para producción conviene separar un usuario de migraciones con más permisos.

### 4.3 Logs

Ya no hay base de datos de logs. Los registros del gateway van a la salida estándar en JSON (sección 2.2) y los del backend a su salida estándar. Dónde recogerlos y por cuánto tiempo (p. ej. Loki, CloudWatch) se decidirá en la fase de infraestructura. La **auditoría de negocio** (quién cambió qué) se hará en una tabla de MySQL con `organization_id`.

---

## 5. Autenticación y autorización

### 5.1 Inicio de sesión

```
1. Frontend → POST /api/auth/login { email, password }   (credentials: 'include')
2. Gateway  → POST :8080/auth/login
3. Java: busca el usuario por correo (normalizado a minúsculas) y valida la contraseña (BCrypt)
4. Java: solo DESPUÉS de validar la contraseña revisa: usuario activo y empresa ACTIVE
5. Java → Gateway: { token, userId, username, email, organizationId, role }
6. Gateway: pone el JWT en cookie httpOnly (Secure y SameSite=Strict en producción) y responde
            { user: { id, username, email, organizationId, role } } — sin el token
```

**Mensajes:** credenciales incorrectas → genérico ("Correo o contraseña incorrectos"), idéntico para un correo que existe y uno que no. Los avisos de cuenta (usuario inactivo, correo sin verificar, empresa suspendida) solo se muestran a quien conoce la contraseña, para que no se pueda averiguar qué correos existen.

### 5.2 JWT

Firmado con HS256 y el secreto `JWT_SECRET` (idéntico en gateway y backend, ≥ 32 caracteres, sin valor por defecto: ninguno de los dos arranca sin él). Duración 24 h.

| Claim | Contenido |
|-------|-----------|
| `sub` | Correo del usuario (único en la plataforma) |
| `id` | Id del usuario |
| `role` | `PLATFORM_OWNER`/`_BILLING`/`_SUPPORT`/`_VIEWER`, `ADMIN` o `SELLER` |
| `org` | Id de la empresa (ausente solo en el equipo de plataforma) |
| `typ` | Solo en los tokens de **desafío** del 2FA (`MFA`/`ENROLL`): no son sesiones |

No hay revocación ni *refresh*: un usuario desactivado o una empresa suspendida conservan acceso hasta que expire el token. El control del estado de la suscripción en cada petición (con una caché corta) está previsto para la fase de planes.

### 5.3 Petición protegida

```
1. El navegador envía la cookie automáticamente
2. Gateway: jwt.verify → req.user; exige 'org' salvo roles PLATFORM_* y rechaza tokens con `typ`; aplica requireRole
3. Gateway reenvía a Java con Authorization: Bearer <token> (utils/authHeader.js)
4. Java: JwtAuthFilter valida de nuevo, fija el rol y la empresa (TenantContext) y aplica las reglas por ruta
5. Hacia analytics: el gateway envía X-Internal-Key y X-Organization-Id (del token verificado)
```

### 5.4 Registro de empresas

Un único servicio (`RegistrationService`) con dos entradas:

| | Autoregistro (landing) | Panel de plataforma |
|---|---|---|
| Endpoint | `POST /api/public/registrations` | `POST /api/platform/organizations` |
| Quién | cualquiera (con CAPTCHA) | equipo de plataforma con permiso de crear |
| Estado inicial | `PENDING` | `ACTIVE` |
| Correo del administrador | sin verificar → recibe enlace | verificado |
| Prueba gratis | 14 días al verificar el correo | no aplica (se define en la fase de planes) |
| Conflicto (NIT/correo) | mensaje genérico (409) | indica qué chocó |

**Verificación:** el enlace (`APP_PUBLIC_URL/verify-email?token=...`) lleva un token aleatorio de 32 bytes; en la base solo se guarda su hash. Es de un solo uso, vale 24 h, y un token inexistente, usado o vencido recibe el mismo error. `POST /api/public/resend-verification` responde siempre igual exista o no el correo y respeta un enfriamiento de 60 s.

**Protección anti-bots** (gateway, rutas `/api/public/*`):
- **CAPTCHA** (`CAPTCHA_PROVIDER`): `turnstile` (Cloudflare Turnstile, requiere `TURNSTILE_SECRET`) o `none`, **solo fuera de producción**. En producción sin CAPTCHA el registro se desactiva (503): falla cerrado.
- **Honeypot:** un campo `website` oculto; un bot que lo rellena recibe un "éxito" falso sin que se cree nada.
- **Límite por IP** y **lista blanca de campos**: a Java solo viajan los campos esperados (un bot no puede enviar `role` ni `organizationId`).

**Correo:** la interfaz `EmailSender` tiene hoy dos implementaciones sin proveedor real: `DevEmailSender` (perfil `dev`: escribe el enlace en el log) y `NoopEmailSender` (resto: registra un error para que la falta de proveedor no pase desapercibida y **no** registra el enlace). Para producción se agrega una implementación con un proveedor (SMTP, SES, Resend, ...) sin tocar el resto.

**Dueño de la plataforma:** `PlatformAdminBootstrap` crea el primer `PLATFORM_OWNER` al arrancar si hay `PLATFORM_ADMIN_EMAIL` y `PLATFORM_ADMIN_PASSWORD` (y opcional `PLATFORM_ADMIN_NAME`) y todavía no existe uno. En su primer ingreso configura el 2FA y su PIN (5.6). Falla si la configuración está incompleta, la contraseña no cumple la política o el correo ya pertenece a un usuario de empresa. Nunca registra la contraseña.

### 5.5 Contraseñas y datos de entrada

Contraseña: 8–72 caracteres con al menos una letra y un número (BCrypt). Todos los cuerpos de entrada se validan con DTOs; los errores devuelven mensajes por campo.

---

### 5.6 Equipo de plataforma: roles, 2FA y PIN

Detalle de producto en [`PANEL_PLATAFORMA.md`](PANEL_PLATAFORMA.md). Resumen técnico:

- **Roles y permisos:** `PLATFORM_OWNER/BILLING/SUPPORT/VIEWER`. `PlatformPermission` define la matriz; `JwtAuthFilter` concede `ROLE_x` y los `PERM_*` del rol, y `SecurityConfig` exige el permiso en cada ruta `/platform/**` (rutas no listadas: `denyAll`). `SENSITIVE` = suspender, cancelar, cambiar plan, pago manual y pruebas > 7 días (solo Dueño por ahora).
- **Sesión revalidada:** para roles de plataforma el filtro consulta la base en cada petición (cuenta activa, mismo rol, `sessions_valid_from` anterior a la emisión del token). Desactivar, cambiar rol o reiniciar acceso cierra sesiones al instante. Sesión de 2 h (`stockmind.platform.session-minutes`).
- **Login en dos pasos:** `POST /auth/login` de un usuario de plataforma devuelve `challengeToken` (JWT con `typ=MFA` o `ENROLL`, sin rol, 5/15 min) en vez de sesión. `POST /auth/mfa/verify` (código TOTP o de respaldo), `/auth/mfa/enroll/start` (secreto + URI `otpauth`) y `/auth/mfa/enroll/finish` (primer código + PIN + contraseña nueva si era temporal → sesión y 8 códigos de respaldo). El gateway pone la cookie solo al recibir la sesión y con la misma duración del token.
- **TOTP:** RFC 6238 (SHA-1, 6 dígitos, 30 s, ±1 paso) implementado sin dependencias (`TotpService`, probado con los vectores del RFC). Se guarda el último paso usado (no se reutiliza). Secreto cifrado con AES-256-GCM (`MfaCrypto`, llave `STOCKMIND_MFA_KEY`).
- **PIN:** 6–10 dígitos, BCrypt. Se exige en cada mutación de `/platform/team` (`PinException` → 403 `PIN_INVALID`, sin cerrar la sesión). Bloqueo de 15 min tras 5 fallos (código y PIN por separado).
- **Equipo (`/platform/team`, permiso `TEAM_MANAGE`):** listar, alta (contraseña temporal, `must_change_password`), cambiar rol/estado/nombre, reiniciar acceso. No se tocan dueños ni la propia cuenta. Todo auditado.
- **Perfil:** `GET /auth/me` devuelve también `fullName` y `permissions`; el frontend los usa solo para mostrar u ocultar controles.

---

### 5.7 2FA de usuarios de empresa

Mismo mecanismo que el equipo de plataforma (5.6, `PlatformSecurityService`/`TotpService`), con estas diferencias:

- **Opcional por usuario**; la empresa puede **exigirla** (`organizations.require_mfa`, `PUT /users/mfa-policy`, solo ADMIN). Sin PIN ni contraseña temporal.
- **Login:** si el usuario la tiene → desafío `MFA`. Si no la tiene y la empresa la exige → desafío `ENROLL` (configura antes de entrar; sin sesión hasta terminar). La cuenta y la empresa se revalidan al completar el segundo paso (una empresa suspendida entre ambos no entra).
- **Autoservicio** (`/auth/mfa/self/*`, solo ADMIN/SELLER): `status`, `setup/start` (pide la contraseña), `setup/finish` (primer código → 8 códigos de respaldo), `disable` (contraseña + código; no si la empresa la exige). Contraseña incorrecta → 400 (no 401, para no cerrar la sesión).
- **Reinicio:** el ADMIN reinicia a un compañero (`POST /users/{id}/reset-mfa`, no a sí mismo ni a otra empresa); el dueño de plataforma reinicia a cualquiera con su PIN (`POST /platform/organizations/{id}/users/{userId}/reset-mfa`, permiso `SENSITIVE`, auditado). El botón está en la ficha de empresa del panel.
- Los usuarios devueltos por `/users` incluyen `mfaEnabledAt` pero ningún secreto, hash ni contador (`@JsonIgnore`; hay prueba que lo vigila).
- Activar la política no cierra sesiones abiertas: se aplica en el siguiente inicio de sesión.

---

## 6. Planes, suscripciones y pagos

> Los precios y límites de los planes son un **borrador** (ver `docs/PLANES_Y_PRECIOS.md` y `StockMind_Modelo_Financiero.xlsx`). Están en la tabla `plans`: se cambian con una migración, sin tocar el código.

### 6.1 Planes

| Plan | Sin IVA/mes | Usuarios | Productos | Funciones premium |
|------|------------:|---------:|----------:|-------------------|
| `STARTER` | $59.900 | 2 | 300 | — |
| `PRO` | $119.900 | 5 | 3.000 | `REPORTS`, `PREDICTIONS`, `EXPORT` |
| `BUSINESS` | $249.900 | 15 | 20.000 | además `AI_ASSISTANT`, `API` |

Inventario, ventas y dashboard van en todos. El plan anual cobra 10 meses de 12. El IVA (19 %, `stockmind.billing.iva-rate`) se suma al precio y se muestra siempre desglosado (neto + IVA = total). `EXPORT`, `AI_ASSISTANT` y `API` existen como banderas, pero las funciones aún no están construidas.

### 6.2 Estados de la suscripción

```
TRIAL ──(paga)──► ACTIVE ──(vence el periodo)──► GRACE ──(7 días sin pagar)──► SUSPENDED ──(90 días)──► CANCELLED
  └─(vence la prueba)────────────────────────────►┘                    └──(paga)──► ACTIVE
```

| Estado | Acceso | Empresa (`organizations.status`) |
|--------|--------|----------------------------------|
| `TRIAL`, `ACTIVE` | completo | `ACTIVE` |
| `GRACE` | **solo lectura**: cualquier cambio responde 402 `SUBSCRIPTION_READ_ONLY` | `ACTIVE` |
| `SUSPENDED` | ninguno (402 `SUBSCRIPTION_BLOCKED`, incluso con un token vigente); no puede iniciar sesión | `SUSPENDED` |
| `CANCELLED` | ninguno | `CANCELLED` |

La prueba (14 días) empieza al **verificar el correo** (autoregistro) o desde el alta (plataforma). Las suscripciones de **cortesía** (`complimentary`) tienen acceso completo sin vencimiento. Una empresa sin suscripción se bloquea (falla cerrado).

### 6.3 Cómo se aplica el plan

- **`SubscriptionAccessFilter`** (backend, después de la autenticación): aplica solo lectura, bloqueo y funciones premium por ruta (`/reports` → `REPORTS`). `/billing` y `/auth` quedan siempre disponibles: son la vía para pagar.
- **Límites:** `EntitlementService.assertCanAddUser/Product` (crear o reactivar usuarios; crear productos) → 402 `PLAN_LIMIT_REACHED`.
- **Funciones que no pasan por Java** (predicciones → Python, asistente → Groq): el gateway consulta `/billing/subscription` y la guarda 30 s por empresa (`feature.middleware.js`), y la vacía cuando un pago o una acción de plataforma cambia el plan. Falla cerrado si no puede consultar.
- **Caché del backend:** `EntitlementService` guarda el estado 30 s por empresa y se vacía en cada cambio; con varias réplicas un cambio puede tardar hasta ese tiempo en verse en las demás.
- El frontend (`SubscriptionContext`) solo muestra avisos, candados y la pantalla de bloqueo: **no es la protección**.

### 6.4 Pagos

Flujo: `POST /billing/checkout` (ADMIN) crea un cobro `PENDING` con la referencia (24 bytes aleatorios) y devuelve la URL de pago → la pasarela confirma → `PaymentService.markPaid(referencia)` activa el plan. `markPaid` es **idempotente** (un webhook repetido no extiende el plan dos veces). Renovar antes de vencer suma el nuevo periodo al final del actual. El enlace vence a las 48 h (la caducidad se deriva de `expires_at`).

- **`PaymentProvider`** abstrae la pasarela. Hoy solo existe `SimulatedPaymentProvider`, activo con `STOCKMIND_PAYMENTS_PROVIDER=simulated` (el override de desarrollo lo define): el "checkout" es la página `/pay/{referencia}` con un botón de prueba. **Sin esa variable no hay proveedor y los cobros responden 503**: un enlace de pago nunca puede "pagarse" solo en producción.
- Para cobrar de verdad se agrega una implementación (p. ej. Wompi) que crea el cobro, devuelve su URL y confirma con un **webhook firmado**; el resto no cambia. El plan de integración con Wompi (flujo, webhook, seguridad, pendientes) está en [`INTEGRACION_WOMPI.md`](INTEGRACION_WOMPI.md).
- `POST /platform/organizations/{id}/manual-payment` registra un pago recibido por fuera (p. ej. acordado por teléfono) y activa el plan.
- **Facturación electrónica DIAN:** aún no integrada; debe estar lista antes del primer cobro real.

### 6.5 Panel de plataforma (`/api/platform/*`, roles `PLATFORM_*` con permiso)

| Acción | Efecto |
|--------|--------|
| Alta de empresa | modo `TRIAL` (prueba desde hoy), `PAID` (pago ya recibido: se registra) o `COMPLIMENTARY` (cortesía) |
| `suspend` / `reactivate` / `cancel` | cambia el estado de la suscripción y de la empresa; reactivar devuelve el acceso según lo que le quede vigente (prueba, periodo pagado, cortesía) o, si nada, una gracia nueva |
| `extend-trial` | suma 1–90 días; en gracia o suspendida reinicia la prueba desde hoy |
| `plan` | cambio de plan acordado, sin cobro |
| `payment-links` | enlace de pago (48 h) para enviar al cliente |
| `manual-payment` | registra un pago recibido por fuera |

**Ficha de empresa** (`PlatformDetailController`, permiso `ORG_VIEW`): `GET /platform/organizations/{id}/detail` (datos, plan con uso, usuarios, cobros solo con `PAYMENT_VIEW`, línea de tiempo = alta + términos + `audit_log` + cobros), `PATCH .../contact` (permiso `ORG_EDIT_CONTACT`: Dueño y Soporte; audita antes→después) y `PATCH .../tax-id` (`SENSITIVE` + PIN; normaliza y exige NIT único). Sin datos de negocio. Importante: el conteo de productos de una empresa ajena usa SQL nativo (`ProductRepository.countActiveByOrganizationId`), porque el filtro `@TenantId` queda fijado cuando se abre la sesión de la petición y fijar `TenantContext` a mitad no lo cambia.

Una empresa sin verificar el correo no puede suspenderse ni reactivarse (409 `ORGANIZATION_PENDING`). **Toda acción queda en `audit_log`.**

### 6.6 Ciclo diario

`SubscriptionLifecycleJob` (06:00, `stockmind.billing.cron`) ejecuta `SubscriptionLifecycleService.run()`, idempotente:

- **Avisos** al correo de contacto de la empresa a ≤5 y ≤1 día del fin de la prueba o del periodo (`EmailSender.sendBillingNotice`: `TRIAL_ENDING`, `RENEWAL_REMINDER`, `GRACE_STARTED`, `SUSPENDED`), una vez cada uno.
- Prueba o periodo vencido → `GRACE` (7 días); gracia vencida → `SUSPENDED` (y la empresa pasa a `SUSPENDED`); suspendida más de 90 días → `CANCELLED`.
- Si el servidor estuvo apagado, una sola corrida pone las suscripciones al día.
- Se omiten las cortesías y las pruebas sin fecha (correo aún sin verificar).
- Pensado para **una sola instancia** del backend: con réplicas hay que añadir un bloqueo (p. ej. ShedLock) para no duplicar avisos.

### 6.7 Endpoints

| Ruta | Rol |
|------|-----|
| `GET /billing/subscription` | ADMIN, SELLER: plan, estado, días de prueba, funciones, límites y uso |
| `GET /billing/plans` | ADMIN, SELLER |
| `GET /billing/payments`, `POST /billing/checkout` | ADMIN |
| `GET /public/plans`, `GET /public/payments/{ref}`, `POST /public/payments/{ref}/simulate` | público (el último solo con la pasarela simulada) |

---

## 7. Manejo de errores

Formato JSON uniforme: `{ "error": "mensaje", "timestamp": "...", "details": { campo: mensaje } }` (`details` solo en validaciones; el gateway añade `code` en algunos casos).

| Código | Situación |
|--------|-----------|
| 200 / 201 / 202 | OK / creado / aceptado (registro y reenvío) |
| 400 | Validación, JSON mal formado, regla de negocio (stock insuficiente, SKU duplicado, rol no permitido) |
| 401 | Sin sesión, token inválido o desactualizado, credenciales incorrectas |
| 403 | Rol insuficiente o sin empresa |
| 402 | Plan: `SUBSCRIPTION_READ_ONLY`, `SUBSCRIPTION_BLOCKED`, `FEATURE_NOT_IN_PLAN`, `PLAN_LIMIT_REACHED` |
| 404 | Recurso inexistente **o de otra empresa** |
| 409 | Datos ya registrados (NIT, correo) |
| 413 | Cuerpo demasiado grande |
| 429 | Límite de frecuencia |
| 500 | Error interno: mensaje genérico; el detalle va solo al log del servidor |
| 503 / 504 | Servicio upstream no disponible / timeout; registro público desactivado sin CAPTCHA |

Un error inesperado **nunca** devuelve su mensaje interno al cliente.

---

## 8. Configuración de entornos

### 8.1 Variables de entorno (`.env` en la raíz)

El `.env` no se versiona; `.env.example` es la plantilla. Docker Compose lo lee y falla con un mensaje claro si falta un valor obligatorio. Para generar valores: `openssl rand -hex 32`.

| Variable | Obligatoria | Uso |
|----------|:---:|-----|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD` | sí | MySQL; la aplicación entra con `MYSQL_USER`, no como `root` |
| `JWT_SECRET` | sí | Firma del JWT (≥ 32 caracteres; igual en gateway y backend) |
| `JWT_EXPIRATION` | no | Milisegundos (por defecto 86 400 000) |
| `INTERNAL_API_KEY` | sí | Clave gateway ↔ analytics (≥ 32 caracteres) |
| `NODE_ENV` | no | `development` o `production` (cookie `Secure`/`SameSite=Strict`, límites, CAPTCHA obligatorio) |
| `FRONTEND_URL` | no | Origen del frontend (CORS) y base de los enlaces de los correos |
| `LANDING_URL` | no | Origen(es) de la landing, separados por coma (solo `/api/public`) |
| `TRUST_PROXY` | no | Número de proxies delante del gateway |
| `VITE_GATEWAY_URL` | no | URL del gateway para el frontend |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` | no | Primer dueño de la plataforma (vacías = no se crea; nombre opcional) |
| `STOCKMIND_MFA_KEY` | prod: sí | Llave que cifra los secretos TOTP; vacía = derivada de `JWT_SECRET` (solo desarrollo) |
| `CAPTCHA_PROVIDER`, `TURNSTILE_SECRET` | prod | Anti-bots del registro público |
| `STOCKMIND_PAYMENTS_PROVIDER` | no | `simulated` = pasarela de pruebas (solo desarrollo); vacío = pagos desactivados (503) |
| `GROQ_API_KEY`, `AGENT_ENABLED` | no | Asistente IA (apagado por defecto) |

Ajustes opcionales del gateway: `ENTITLEMENT_CACHE_SECONDS` (30), `REGISTRATION_RATE_LIMIT` (5), `UPSTREAM_TIMEOUT_MS` (15000), `BODY_LIMIT` (100kb), `LOG_LEVEL` (info). El backend admite `stockmind.trial-days`, `stockmind.verification-hours`, `stockmind.terms-version` y `stockmind.billing.*` (IVA, días de gracia y retención, vigencia del enlace de pago, caché, cron) en `application.yml`.

Archivos locales no versionados: `.env`, `backend/src/main/resources/application.properties` (opcional, plantilla `.example`) y `analytics/config.py` (opcional: dentro de Docker se genera desde el entorno).

### 8.2 Desarrollo con Docker (recomendado)

```bash
docker compose up --build --watch
```

`docker-compose.override.yml` (solo desarrollo) activa el perfil `dev` del backend (datos de ejemplo y enlaces de verificación en el log) y la pasarela de pagos simulada, publica MySQL en `127.0.0.1:3306` y define las reglas de `--watch`: el frontend sincroniza `src` (Vite recarga), el gateway y analytics sincronizan y se reinician, y el backend se reconstruye. Si `--watch` deja de reaccionar, reconstruir a mano: `docker compose up -d --build <servicio>`.

Reiniciar la base con los datos de ejemplo: `docker compose down -v` y volver a levantar (borra los datos de desarrollo).

### 8.3 Producción (consideraciones pendientes)

- Usar solo `docker-compose.yml` (sin el override), con secretos reales gestionados fuera del repositorio.
- Imágenes de producción: frontend con `vite build` servido como estático (hoy el contenedor corre `vite dev`), analytics con `gunicorn` (hoy el servidor de desarrollo de Flask), contenedores sin root, `npm ci` y multi-stage.
- HTTPS en el borde (proxy inverso) y `TRUST_PROXY`; `NODE_ENV=production`.
- Zona horaria definida (hoy UTC), backups de MySQL probados, monitoreo y alertas, recogida de logs.
- Proveedor de correo y CAPTCHA configurados; usuario de migraciones separado.
- Rate limiting con almacén compartido si hay varias réplicas del gateway.

---

## 9. Pruebas y CI

| Servicio | Herramienta | Pruebas | Cómo ejecutar |
|----------|-------------|--------:|---------------|
| Backend | JUnit + MockMvc (H2 por defecto) | 171 | `mvn test` en `backend/` |
| Backend contra **MySQL real** | idem, con `MYSQL_TEST_URL` | 171 | `MYSQL_TEST_URL=jdbc:mysql://host:3306/db MYSQL_TEST_USER=... MYSQL_TEST_PASSWORD=... mvn test` |
| Gateway | `node:test` (sin dependencias) | 166 | `npm test` en `gateway/` |
| Frontend | Vitest + Testing Library | 117 | `npx vitest run` en `frontend/` |
| Analytics | pytest | 65 (+4 contra MySQL real) | `python -m pytest` en `analytics/` (con `ANALYTICS_MYSQL_HOST` corre también el aislamiento sobre MySQL) |

Cobertura destacada: roles y tokens, validaciones, ventas con **concurrencia** (nunca se vende más del stock), **aislamiento entre empresas** (listados, por id, escrituras cruzadas, reportes, usuarios, analytics), login, registro y verificación, planes (solo lectura, bloqueo, funciones y límites), pagos idempotentes, ciclo diario, panel de plataforma, paginación y orden permitido, cabeceras de seguridad, CORS, límites y logs sin datos sensibles.

**CI** (`.github/workflows/ci.yml`): cinco trabajos en cada push a `main` y pull request (backend con H2, backend con MySQL real y migraciones, gateway, frontend con *build*, analytics con MySQL real). `npm run lint` del frontend aún no está en el CI por 2 errores preexistentes en `AgentBubble.jsx`.

---

## 10. Dependencias y versiones

**Gateway** (Node 20): express ^4.18, axios ^1.6, cors, helmet ^8, pino ^10, pino-http ^11, express-rate-limit ^7, jsonwebtoken ^9, cookie-parser, dotenv.

**Backend:** Java 17, Spring Boot 3.2.0, Hibernate 6.4.4 (fijado), Flyway (+ `flyway-mysql`), jjwt 0.11.5, mysql-connector-j, Lombok; pruebas con H2.

**Analytics** (Python 3.11): flask 3.0.0, flask-cors 4.0.0, mysql-connector-python 8.2.0, pandas ≥ 2.2, numpy ≥ 2.0, scikit-learn ≥ 1.4, gunicorn 21.2.0 (aún sin usar).

**Frontend:** react ^19.2, react-router-dom ^7.14, vite ^8, vitest ^4.

**Infraestructura:** MySQL 8.0.

**Actualizaciones recomendadas** (ver `STOCKMIND_TECHNICAL_AUDIT.md`): Node 22 LTS, MySQL 8.4 LTS, Spring Boot 3.4+, flask-cors y gunicorn (avisos de seguridad en las versiones fijadas), fijar versiones de pandas/numpy/scikit-learn.

---

## 11. Estructura del código

### 11.1 Backend (`com.stockmind`)

```
├── StockmindApplication
├── billing/     EntitlementService · SubscriptionService · SubscriptionLifecycleService/Job
│                PaymentService · PaymentProvider (+ Simulated) · BillingQueryService · AuditService
├── bootstrap/   PlatformAdminBootstrap                       # primer PLATFORM_OWNER desde el entorno
├── config/      JwtConfig · SecurityConfig (+ JwtAuthFilter) · SubscriptionAccessFilter · DevDataSeeder
├── controller/  Auth · Billing · Category · Dashboard · Inventory · MfaSelf · Platform · PlatformDetail · PlatformTeam · Product
│                PublicBilling · PublicRegistration · Report · Sale · User
├── dto/         BillingDTO · InventoryDTO · LoginRequest/Response · PageResponse · PlatformDTO
│                ProductDTO · RegistrationDTO · SaleDTO · TeamDTO · UserDTO · CompanyDetailDTO
├── exception/   ConflictException · PinException · ResourceNotFoundException · GlobalExceptionHandler
├── platform/    PlatformPermission · PlatformSecurityService · TotpService · MfaCrypto   # roles, 2FA y PIN
├── mail/        EmailSender · DevEmailSender · NoopEmailSender
├── model/       AuditLog · Category · EmailVerificationToken · InventoryMovement · Organization
│                Payment · Plan · PlatformBackupCode · Product · Sale · SaleDetail · Subscription · User
├── repository/  *Repository (+ spec/ con los filtros combinables)
├── service/     Auth · Dashboard · Inventory · Product · Registration · Sale
├── tenant/      TenantContext · TenantIdentifierResolver
└── util/        Paging
resources/       application.yml · db/migration/V*.sql · db/dev/seed.sql
```

### 11.2 Gateway

```
gateway/
├── app.js                    # construye la aplicación (testeable)
├── server.js                 # la arranca
├── src/
│   ├── config/config.js      # valida JWT_SECRET e INTERNAL_API_KEY
│   ├── middleware/           # auth.middleware.js (authenticate, requireRole, requireOrganization)
│   │                         # feature.middleware.js (requireFeature por plan) · errorHandler.middleware.js
│   ├── routes/               # agent · auth · billing · categories · dashboard · inventory · platform
│   │                         # predictions · products · public · reports · sales · users
│   └── utils/                # authHeader.js · internalHeaders.js · captcha.js
└── test/                     # node:test: auth, rutas, app, logs, CAPTCHA, errores...
```

### 11.3 Analytics

```
analytics/
├── app.py · config.py(.example) · requirements.txt · requirements-dev.txt · pytest.ini
├── src/{models, routes, services}/
└── tests/
```

---

## 12. Pendientes conocidos

| Área | Pendiente |
|------|-----------|
| Planes | Pasarela de pagos real (Wompi u otra) con webhook firmado y facturación electrónica DIAN; **correo real** para los avisos de prueba y vencimiento; precios definitivos; bloqueo (ShedLock) del ciclo diario si hay varias réplicas |
| Panel de plataforma | Métricas de actividad por empresa (uso, últimas conexiones); `EXPORT`, `AI_ASSISTANT` y `API` aún sin construir; pantalla de auditoría |
| Cuentas | Recuperación y cambio de contraseña (incluido el cambio obligatorio tras un alta por teléfono) |
| Correo | Proveedor real de correo (SMTP/SES/...) |
| Infraestructura | Imágenes de producción, HTTPS, backups, monitoreo, recogida de logs, zona horaria, usuario de migraciones |
| Datos | Auditoría de negocio por empresa; paginación de las pantallas que aún cargan listas completas; `ADJUSTMENT` como conteo físico |
| Analytics | Respuesta 503 cuando MySQL falla; evaluación del error del modelo (backtesting) |
| Calidad | Alinear versiones internas; corregir los 2 errores de lint de `AgentBubble.jsx` y activarlo en el CI; actualizar dependencias (sección 10) |
| Asistente IA | Reactivar y definir qué datos se envían al proveedor |

---

*StockMind v1.4.0 — Manual Técnico — BlackLabs Dev*
