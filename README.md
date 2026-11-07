# StockMind — Sistema Inteligente de Gestión de Inventario y Predicción de Demanda

> Plataforma web para la gestión de inventario y ventas con analítica predictiva integrada.

> **Documentación vigente:** la arquitectura, la configuración, la seguridad y las pruebas están descritas en [`docs/manual-tecnico.md`](docs/manual-tecnico.md) (v1.4.0). Algunas secciones históricas de este README (changelog antiguo, diagramas) describen versiones anteriores.

---

## Changelog

### [1.4.0] - Multiempresa y endurecimiento
> Noviembre 2026

**Plataforma multiempresa (SaaS)**
- Tabla `organizations` y aislamiento automático de los datos por empresa (`organization_id` + `@TenantId` de Hibernate). El SKU, la categoría y el nombre de usuario son únicos por empresa.
- Inicio de sesión por **correo electrónico**; el token lleva la empresa.
- Equipo de plataforma con roles (`PLATFORM_OWNER`, `PLATFORM_BILLING`, `PLATFORM_SUPPORT`, `PLATFORM_VIEWER`) y permisos por función; panel `/platform`.
- Registro de empresas: **autoregistro** con verificación de correo, CAPTCHA, honeypot y **14 días de prueba gratis**, y **alta desde el panel de plataforma**.
- Servicio de analítica aislado por empresa y autenticado con clave interna gateway ↔ analytics.

**Planes, suscripciones y cobros**
- Planes (Starter, Pro, Business) con precios + IVA, límites y funciones por plan; suscripción con prueba, gracia de solo lectura, suspensión y cancelación; avisos por correo a 5 y 1 día del vencimiento.
- Pagos con pasarela **simulada** (la real, Wompi, está pendiente), enlaces de pago y pago manual.

**Panel de plataforma**
- Resumen con métricas (estados, pruebas por vencer, ingresos, MRR), ficha de cada empresa (datos, uso frente a límites, usuarios, cobros, línea de tiempo), cobros y auditoría con filtros.
- Equipo de plataforma con confirmación por PIN; **solicitudes con aprobación del dueño** para acciones sensibles; editor de planes y precios.

**Seguridad e integridad**
- **Verificación en dos pasos** (app autenticadora y códigos de respaldo): obligatoria para el equipo de plataforma y opcional (o exigible por el administrador) para las empresas.
- Secretos fuera del repositorio (`.env`), puertos internos cerrados y usuario de aplicación de MySQL sin permisos de administrador.
- Roles aplicados también en el backend; ventas con precio fijado por el servidor y bloqueo de stock; validación de entradas con DTOs; errores sin detalles internos.
- Gateway con Helmet, límites de cuerpo, timeouts y logging estructurado (JSON).

**Correo, marca y diseño adaptable**
- Correo transaccional con **Resend** (verificación de cuenta y avisos de la suscripción).
- Identidad de marca: logo vectorial, favicon, ícono de la app y paleta; componente `BrandLogo`.
- Interfaz **responsive**: menú compacto en tablet, cajón en celular, tablas como tarjetas y diálogos como hoja inferior.

**Calidad e infraestructura**
- Migraciones con **Flyway**; Hibernate solo valida el esquema.
- Paginación y filtros del lado del servidor; dashboard con resumen calculado en la base de datos.
- Pruebas automáticas en los cuatro servicios y CI en GitHub Actions.
- Entorno de desarrollo con recarga automática (`docker compose up --build --watch`).

**Eliminado**
- **MongoDB** y el logging a Mongo: los logs pasan a la salida estándar en formato JSON.
- El asistente IA queda temporalmente apagado (`AGENT_ENABLED=false`) mientras se reconstruye.

### [1.3.6] - Capa de Logging con MongoDB (Experimental / Reto técnico)
> Septiembre 2026

Se incorpora MongoDB como capa de logging desacoplada de MySQL, implementada como reto técnico para validar el patrón de **persistencia políglota** (relacional para datos transaccionales, documental para logs y trazabilidad) antes de decidir si se adopta como parte definitiva de la arquitectura.

#### Added

- Nuevo servicio `stockmind_mongo` en `docker-compose.yml`, con volumen persistente y autenticación.
- Archivo de conexión centralizado `gateway/db/mongo.js`.
- Middleware `mongoLogger` en el gateway: registra método, ruta, status code, IP y tiempo de respuesta de cada request en la colección `logs`, sin bloquear la respuesta al cliente.
- Visualización local de los logs vía **MongoDB Compass**, conectando directamente al puerto `27017` expuesto por Docker.

#### Changed

- `server.js` ahora espera la conexión a MongoDB antes de aceptar tráfico; si Mongo falla al iniciar, el gateway no levanta — así se detecta el problema de inmediato en vez de perder logs de forma silenciosa.

#### Nota

- Implementación exploratoria. MongoDB no participa en la lógica de negocio ni en el flujo de datos transaccionales (ventas, inventario, usuarios) — su único rol es registrar eventos operativos del gateway.

---

### [1.3.5] - StockMindGlass Effect
> Septiembre 2026

#### Changed

- Se incorpora el efecto visual **StockMindGlass** al botón flotante del agente de IA.
- Se añade refracción y desenfoque suave mediante `GlassElement`, manteniendo una apariencia sutil sobre el fondo oscuro.
- Se añade una ligera ampliación y elevación del botón al pasar el cursor.
- Se prepara `GlassElement` para futuras aplicaciones del efecto StockMindGlass en otros componentes de la interfaz.

#### Added

- Nueva base visual **StockMindGlass** para efectos de cristal, basada en refracción mediante `backdrop-filter` y mapas de desplazamiento SVG.

---

### [1.3.2] - Seguridad de sesión: JWT fuera de localStorage
> Septiembre 2026

#### Changed

- El JWT ya no se almacena en `localStorage` ni viaja en el body de
  `/api/auth/login`: ahora se setea como cookie `httpOnly` desde el
  gateway, inaccesible para JavaScript (mitiga robo de token vía XSS).
- `AuthContext` restaura la sesión llamando a `/api/auth/me` al montar
  la app, en vez de leer el token guardado localmente.
- Login y logout actualizados en frontend (`api.js`, `AuthContext.jsx`,
  `Login.jsx`) para trabajar solo con `{ user }`, sin manejar el token.

#### Added

- Endpoint `POST /api/auth/logout` en el gateway, que limpia la cookie
  del lado del servidor.
- Helper centralizado `utils/authHeader.js` en el gateway: reconstruye
  el header `Authorization` hacia Java a partir de la cookie, en un
  solo lugar en vez de repetirlo en cada archivo de rutas.
- CORS del gateway ajustado (`credentials: true`, origin explícito)
  para permitir cookies entre frontend y gateway.

#### Fixed

- 403 en todas las rutas protegidas tras el cambio a cookie (Java no
  recibía el token porque el gateway seguía leyendo el header
  `Authorization` vacío en vez de la cookie).
- Bucle infinito de recarga causado por tratar el 401 esperado de
  `/api/auth/me` (sin sesión aún) igual que un 401 de sesión caída.

### [1.3.1] - Rate limiting en el gateway
> Septiembre 2026

#### Added

- Rate limiting activado en el gateway (antes importado pero sin aplicar).
- Límite estricto en `/api/auth/login` (10 intentos / 15 min) contra fuerza bruta.
- Límite general en el resto de `/api` (600 peticiones / 5 min en producción,
  5000 en desarrollo) para no bloquear la navegación normal entre módulos.
- Identificación por usuario autenticado (`req.user.id`) cuando hay sesión,
  con fallback a IP.

### [1.3.0] - Rediseño visual y mejoras en gestión de usuarios

> Septiembre 2026

#### Added

- Nueva identidad visual para StockMind basada en un estilo Dark Glass / Glassmorphism.
- Nueva base visual global con superficies translúcidas, bordes, sombras, gradientes y efectos de profundidad.
- Nueva paleta visual orientada a una experiencia SaaS moderna y tecnológica.
- Mejoras generales en botones, tarjetas, tablas, formularios, modales, estados y elementos de interfaz.

#### Fixed

- Restaurado el botón **"+ Nuevo usuario"** en el módulo de Usuarios después de la migración de la interfaz original en HTML a React.
- Corregido el error al crear usuarios causado por `updated_at` con valor `NULL`.
- `updatedAt` ahora se inicializa correctamente al crear un usuario y se actualiza automáticamente al modificarlo.

---

### [1.2.1] - Solucionado Seed.sql

> Septiembre 2026

#### Fixed

- Corregido problema de encoding UTF-8 en `seed.sql` que causaba corrupción de tildes y caracteres especiales como `ñ` al importar la base de datos en Docker (mojibake tipo `"Ã¡"` en vez de `"á"`).

---

### [1.2.0] - Agente de IA Conversacional (Experimental)

> Mayo 2026

Se integra un asistente de inteligencia artificial conversacional como componente flotante en el frontend, accesible desde cualquier módulo del sistema. El agente opera en modo experimental y no tiene acceso directo a la base de datos en esta versión.

**Cambios realizados:**
- Nuevo componente `AgentBubble.jsx` — burbuja flotante tipo FAB posicionada en la esquina inferior derecha, visible en todos los módulos autenticados
- Integración con **Groq API** usando el modelo `llama-3.3-70b-versatile` como motor de lenguaje
- Contexto dinámico por módulo: el agente reconoce en qué sección del sistema se encuentra el usuario y adapta sus respuestas y sugerencias
- Chips de preguntas rápidas específicos por módulo (Dashboard, Productos, Inventario, Ventas, Reportes, Predicciones, Usuarios)
- Indicador de estado en tiempo real: **en línea** (verde), **verificando** (amarillo), **sin conexión** (rojo)
- Banner de servicio no disponible con botón de reintento automático
- Mensajes de error amigables diferenciados por tipo de fallo (cuota agotada, API key inválida, error de red)
- Historial de conversación con contexto de los últimos 10 mensajes por sesión

**Estado experimental — limitaciones conocidas:**
- El agente no tiene acceso directo al backend ni a la base de datos; responde con conocimiento general del sistema
- La API key de Groq debe configurarse manualmente en el componente o como variable de entorno Vite
- El historial de conversación no persiste entre sesiones

**Lo que NO cambió:**
- Arquitectura del sistema — ningún servicio existente fue modificado
- Gateway Node.js, backend Java, microservicio Python y base de datos intactos
- Lógica de autenticación, rutas protegidas y todos los módulos funcionales

---

### v1.1.0 — Migración del Frontend a React
> Abril 2026

El frontend del sistema fue completamente migrado de HTML/CSS/JavaScript vanilla a **React 18 con Vite**, manteniendo el diseño visual, la lógica de negocio y la integración con el gateway Node.js sin modificaciones.

**Cambios realizados:**
- Reemplazo de las 8 páginas HTML independientes por una **Single Page Application (SPA)** con React Router
- Implementación de `AuthContext` para manejo global de sesión JWT
- Componente `Sidebar` con `NavLink` de React Router (estado activo automático, sin repetición de HTML)
- Modal reutilizable y sistema de toasts como hooks y componentes React
- Protección de rutas mediante verificación del token JWT en el contexto
- Cliente HTTP centralizado (`api.js`) migrado como módulo ES con exports explícitos
- Stack: **Vite + React 18 + React Router DOM**

**Lo que NO cambió:**
- Paleta de colores, tipografías (Syne, Outfit, DM Mono) y estilos visuales
- Lógica de autenticación y manejo del JWT en `localStorage`
- Todas las llamadas al gateway Node.js (puerto 3000) — el backend no fue tocado
- Funcionalidades: Dashboard, Productos, Inventario, Ventas, Reportes, Predicciones, Usuarios

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Planteamiento del Problema](#planteamiento-del-problema)
3. [Justificación](#justificación)
4. [Objetivos](#objetivos)
5. [Alcance](#alcance)
6. [Requisitos del Sistema](#requisitos-del-sistema)
7. [Arquitectura del Sistema](#arquitectura-del-sistema)
8. [Tecnologías Utilizadas](#tecnologías-utilizadas)
9. [Estructura de Carpetas](#estructura-de-carpetas)
10. [Diseño de Base de Datos](#diseño-de-base-de-datos)
11. [Endpoints del Sistema](#endpoints-del-sistema)
12. [Flujo de Integración](#flujo-de-integración)
13. [Guía de Instalación y Ejecución](#guía-de-instalación-y-ejecución)

---

## Descripción General

**StockMind** es una plataforma web empresarial de gestión de inventario y ventas que incorpora analítica predictiva como componente diferenciador. Permite a pequeñas y medianas empresas controlar su cadena de suministro en tiempo real, registrar ventas, gestionar usuarios y tomar decisiones de reabastecimiento basadas en modelos estadísticos de predicción de demanda.

El sistema está construido sobre una arquitectura distribuida por capas:

| Capa | Tecnología | Puerto |
|------|-----------|--------|
| Frontend | React 18 + Vite + React Router | 5173 |
| API Gateway | Node.js + Express | 3000 |
| Backend Principal | Java Spring Boot | 8080 |
| Microservicio Analítico | Python Flask | 8000 |
| Base de Datos | MySQL | 3306 |
| Logging / Trazabilidad | MongoDB | 27017 |

---

## Planteamiento del Problema

Las pequeñas y medianas empresas del sector comercial enfrentan pérdidas recurrentes derivadas de una gestión deficiente del inventario: sobrestock que inmoviliza capital, desabastecimiento que afecta las ventas, y ausencia de herramientas que conviertan el historial de ventas en inteligencia operativa.

**Consecuencias identificadas:**
- Decisiones de compra basadas en intuición y no en datos históricos
- Pérdidas por productos vencidos o sin rotación
- Quiebres de stock en productos de alta demanda
- Ausencia de alertas tempranas de desabastecimiento
- Imposibilidad de anticipar picos de demanda estacionales

**Pregunta de investigación:** ¿Cómo puede un sistema de información integrado con capacidad predictiva mejorar la toma de decisiones de reabastecimiento en pequeñas y medianas empresas?

---

## Justificación

**Dimensión académica:** El proyecto integra un stack tecnológico heterogéneo en una arquitectura de microservicios real, demostrando competencias en diseño de sistemas distribuidos, comunicación entre servicios REST y separación de responsabilidades.

**Dimensión técnica:** Cada tecnología cumple un rol específico y no intercambiable. Java Spring Boot provee robustez transaccional. Node.js actúa como gateway sin acoplamiento directo. Python aporta capacidad estadística madura (scikit-learn, statsmodels, pandas) que complementa al stack sin duplicar responsabilidades. React permite una experiencia de usuario fluida mediante SPA con estado global de sesión. MongoDB aporta un modelo documental flexible para trazabilidad y logs, sin forzar ese tipo de dato dentro del esquema relacional de MySQL.

**Dimensión empresarial:** La predicción de demanda reduce el costo de capital inmovilizado en inventario entre un 15% y 35% según estudios del sector logístico. StockMind democratiza esta capacidad para empresas sin acceso a soluciones ERP de alto costo.

---

## Objetivos

### Objetivo General

Desarrollar una plataforma web full stack para la gestión integral de inventario y ventas, incorporando un microservicio de analítica predictiva en Python que permita estimar la demanda futura por producto y generar recomendaciones de reabastecimiento basadas en historial de ventas.

### Objetivos Específicos

1. Diseñar e implementar una arquitectura distribuida por capas con separación clara de responsabilidades.
2. Desarrollar el backend principal en Java Spring Boot con módulos de autenticación, gestión de productos, control de inventario y registro de ventas.
3. Implementar un gateway API en Node.js con Express que unifique las rutas y gestione la comunicación entre frontend y servicios backend.
4. Construir un microservicio en Python Flask que consuma historial de ventas desde MySQL y genere predicciones de demanda usando regresión lineal o media móvil ponderada.
5. Diseñar una base de datos MySQL normalizada que soporte transacciones de inventario, ventas y almacenamiento de predicciones.
6. Desarrollar un frontend en React 18 con Vite que consuma exclusivamente las rutas del gateway Node.js, implementando navegación SPA con React Router y gestión de estado de sesión con Context API.
7. Incorporar una capa de logging desacoplada en MongoDB para trazabilidad de requests y errores, sin acoplar ese registro al modelo transaccional.
8. Documentar el sistema con nivel de detalle suficiente para su reproducción técnica y presentación académica.

---

## Alcance

### Incluido

- Autenticación JWT con roles (Admin, Vendedor)
- CRUD completo de productos con categorías
- Control de stock con movimientos de entrada/salida y alertas de stock mínimo
- Registro de ventas con detalle por producto y actualización automática de inventario
- Dashboard con métricas clave
- Predicción de demanda semanal/mensual por producto
- Recomendaciones automáticas de cantidad a reabastecer
- Reportes de ventas por período
- Asistente de IA conversacional integrado (experimental, v1.2.0)
- Logging de requests, errores y trazabilidad en MongoDB (experimental, v1.3.6)

### Excluido

- Integración con pasarelas de pago reales
- Módulo de proveedores y órdenes de compra automatizadas
- Aplicación móvil nativa
- Modelos de machine learning avanzados (LSTM, Prophet)
- Multi-tenancy
- Acceso del agente IA a datos en tiempo real del backend (previsto para v1.3.0)
- Dashboard visual de consulta de logs (por ahora se inspeccionan vía MongoDB Compass)

---

## Requisitos del Sistema

### Requisitos Funcionales

| ID | Módulo | Descripción |
|----|--------|-------------|
| RF-01 | Autenticación | Login con usuario/contraseña, retorna JWT |
| RF-02 | Usuarios | CRUD de usuarios con gestión de roles |
| RF-03 | Productos | CRUD completo con SKU, categoría, precio, stock mínimo |
| RF-04 | Inventario | Registro de entradas/salidas con motivo y fecha |
| RF-05 | Ventas | Registro con múltiples productos y cálculo automático |
| RF-06 | Stock auto | Descuento automático de inventario al registrar venta |
| RF-07 | Alertas | Notificaciones de productos con stock bajo el mínimo |
| RF-08 | Reportes | Ventas por rango de fechas y por producto |
| RF-09 | Predicción | Demanda semanal y mensual por producto |
| RF-10 | Recomendación | Cantidad sugerida a reabastecer por producto |
| RF-11 | Agente IA | Asistente conversacional accesible desde cualquier módulo (experimental) |
| RF-12 | Logging | Registro de cada request (método, ruta, status, IP, tiempo de respuesta) en MongoDB |

### Requisitos No Funcionales

| ID | Categoría | Descripción |
|----|-----------|-------------|
| RNF-01 | Seguridad | JWT requerido en todos los endpoints excepto login |
| RNF-02 | Seguridad | Contraseñas almacenadas con BCrypt |
| RNF-03 | Rendimiento | Respuesta del gateway < 500ms para CRUD estándar |
| RNF-04 | Disponibilidad | Microservicio Python funciona independientemente |
| RNF-05 | Mantenibilidad | Código organizado por módulos con responsabilidad única |
| RNF-06 | Escalabilidad | Arquitectura permite agregar microservicios sin refactorizar |
| RNF-07 | Portabilidad | Cada servicio ejecutable de forma independiente |
| RNF-08 | Documentación | Todos los endpoints documentados |
| RNF-09 | Trazabilidad | Registro de requests, errores y eventos operativos en una base NoSQL independiente (MongoDB), desacoplada del modelo transaccional |

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                      │
│         React 18 + Vite + React Router DOM               │
│         Context API para sesión JWT                       │
│         AgentBubble (Groq / Llama 3.3) [experimental]    │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP/REST
                      ▼
┌──────────────────────────────────────────────────────────┐
│             API GATEWAY — Node.js + Express               │
│  · Verificación JWT centralizada                          │
│  · Proxy/enrutamiento a Java API o Python API            │
│  · CORS, rate limiting, manejo de errores                │
│  · Logging de requests → MongoDB                          │
│  Puerto: 3000                                             │
└──────┬───────────────────────┬────────────────────┬───────┘
       │ HTTP/REST             │ HTTP/REST           │ driver nativo
       ▼                       ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ BACKEND           │  │ MICROSERVICIO    │  │      MongoDB 7.x      │
│ Java Spring Boot  │  │ Python Flask     │  │   stockmind_logs      │
│ Puerto: 8080       │  │ Puerto: 8000     │  │   Puerto: 27017       │
└─────────┬──────────┘  └────────┬─────────┘  │  logs de requests,    │
          │ JDBC/JPA             │            │  errores, 404, etc.   │
          │        SQLAlchemy/mysql-connector │  (solo trazabilidad,  │
          └───────────┬──────────┘            │  no lógica de negocio)│
                       ▼                       └────────────────────────┘
          ┌───────────────────────────────┐
          │         MySQL 8.x             │
          │  stockmind_db                 │
          │  Puerto: 3306                 │
          └───────────────────────────────┘
```

### Principio de diseño

El frontend **nunca** consume directamente el backend Java ni el microservicio Python. Todo el tráfico pasa por el gateway Node.js, que actúa como único punto de entrada, aplicando autenticación centralizada y enrutamiento transparente.

El agente de IA (`AgentBubble`) es el único componente que realiza llamadas externas directamente desde el navegador, exclusivamente hacia la API de Groq. No interactúa con el gateway ni con los servicios internos del sistema en esta versión.

MongoDB opera como una rama independiente del gateway, exclusivamente para logging y trazabilidad: ningún módulo funcional (productos, inventario, ventas, predicciones) lee ni escribe en ella. MySQL sigue siendo la única fuente de verdad para los datos de negocio.

---

## Tecnologías Utilizadas

| Tecnología | Versión | Rol | Justificación |
|-----------|---------|-----|--------------|
| React | 18 | Frontend SPA | Componentes reutilizables, estado global, navegación SPA |
| Vite | 8.x | Bundler/Dev server | HMR ultrarrápido, build optimizado |
| React Router DOM | 6.x | Enrutamiento SPA | Navegación declarativa con protección de rutas |
| Node.js | 20 LTS | API Gateway | I/O no bloqueante ideal para proxy de peticiones |
| Express | 4.x | Framework HTTP | Minimalista, robusto, ecosistema maduro |
| Java | 17 LTS | Backend | Tipado fuerte, robustez |
| Spring Boot | 3.x | Framework Java | Auto-configuración, Spring Security, JPA |
| Python | 3.11+ | Microservicio | Ecosistema estadístico sin equivalente |
| Flask | 3.x | Framework Python | Ligero, ideal para microservicio REST |
| MySQL | 8.x | Base de datos | ACID compliance, integridad referencial |
| MongoDB | 7.x | Logging / trazabilidad | Modelo documental flexible para logs y eventos, desacoplado del esquema relacional |
| pandas | 2.x | Analítica | Manipulación de series temporales |
| scikit-learn | 1.x | ML | Modelos de regresión y predicción |
| JWT | — | Autenticación | Stateless, compatible con arquitectura distribuida |
| Groq API | — | Motor IA (experimental) | Inferencia ultrarrápida, free tier generoso, compatible con formato OpenAI |
| Llama 3.3 70B | — | Modelo de lenguaje (experimental) | Capacidad conversacional avanzada en español |

---

## Estructura de Carpetas

```
stockmind/
├── README.md
├── start.bat
├── docker-compose.yml               ← Orquesta mysql, mongo, backend, analytics, gateway, frontend
├── docs/
│   ├── architecture.md
│   ├── api-endpoints.md
│   ├── database-design.md
│   ├── manual-tecnico.md
│   └── manual-usuario.md
│
├── frontend/                        ← React 18 + Vite (migrado desde HTML/CSS/JS)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                  ← Router + layout protegido
│       ├── api.js                   ← Cliente HTTP + Auth helpers
│       ├── index.css                ← Estilos globales
│       ├── context/
│       │   └── AuthContext.jsx      ← Sesión JWT global
│       ├── hooks/
│       │   └── useToast.js
│       ├── components/
│       │   ├── layout/
│       │   │   └── Sidebar.jsx
│       │   └── ui/
│       │       ├── Modal.jsx
│       │       ├── ToastContainer.jsx
│       │       ├── GlassElement.jsx  ← Base visual StockMindGlass (refracción/blur)
│       │       └── AgentBubble.jsx  ← Agente IA conversacional [experimental]
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── Products.jsx
│           ├── Inventory.jsx
│           ├── Sales.jsx
│           ├── Reports.jsx
│           ├── Predictions.jsx
│           └── Users.jsx
│
├── gateway/
│   ├── package.json
│   ├── server.js
│   ├── .env
│   ├── db/
│   │   └── mongo.js                 ← Conexión centralizada a MongoDB
│   └── src/
│       ├── config/config.js
│       ├── middleware/
│       │   ├── auth.middleware.js
│       │   ├── logger.middleware.js
│       │   ├── mongoLogger.middleware.js  ← Registra cada request en MongoDB
│       │   └── errorHandler.middleware.js
│       └── routes/
│           ├── auth.routes.js
│           ├── products.routes.js
│           ├── inventory.routes.js
│           ├── sales.routes.js
│           ├── users.routes.js
│           ├── reports.routes.js
│           └── predictions.routes.js
│
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/stockmind/
│       │   ├── StockmindApplication.java
│       │   ├── config/
│       │   ├── controller/
│       │   ├── service/
│       │   ├── repository/
│       │   ├── model/
│       │   ├── dto/
│       │   └── exception/
│       └── resources/
│           └── application.properties
│
├── analytics/
│   ├── requirements.txt
│   ├── app.py
│   ├── config.py
│   └── src/
│       ├── routes/predictions.py
│       ├── services/
│       │   ├── prediction_service.py
│       │   └── database_service.py
│       └── models/demand_model.py
│
└── database/
    ├── schema.sql
    └── seed.sql
```

---

## Diseño de Base de Datos

### Diagrama Entidad-Relación

```
USERS ──────────────────── SALES
  id (PK)                    id (PK)
  username                   user_id (FK → USERS)
  email                      total
  password_hash              status
  role                       created_at
  active
  created_at          SALE_DETAILS
                         id (PK)
CATEGORIES               sale_id (FK → SALES)
  id (PK)                product_id (FK → PRODUCTS)
  name                   quantity
  description            unit_price
                         subtotal
PRODUCTS
  id (PK)          INVENTORY_MOVEMENTS
  category_id (FK)    id (PK)
  name                product_id (FK → PRODUCTS)
  sku                 user_id (FK → USERS)
  description         type (ENTRY/EXIT/SALE/ADJUST)
  price               quantity
  stock_current       reason
  stock_minimum       stock_before
  unit                stock_after
  active              created_at
  created_at
               DEMAND_PREDICTIONS
                  id (PK)
                  product_id (FK → PRODUCTS)
                  period_type (WEEKLY/MONTHLY)
                  period_label
                  predicted_quantity
                  confidence
                  generated_at
```

### Colección de logs (MongoDB)

Independiente del modelo relacional anterior, el gateway registra trazabilidad operativa en una base MongoDB separada (`stockmind_logs`). No tiene relación con las tablas de MySQL ni participa en la lógica de negocio — es solo para depuración y monitoreo.

```js
// Colección: logs
{
  timestamp: ISODate,
  service: "gateway",
  level: "info" | "warn" | "error",
  method: "GET",
  route: "/api/products/123",
  statusCode: 404,
  userId: ObjectId | null,
  ip: "192.168.1.10",
  responseTimeMs: 42
}
```

---

## Endpoints del Sistema

### Gateway (Puerto 3000)

**Autenticación**
```
POST   /api/auth/login              → Iniciar sesión
GET    /api/auth/me                 → Perfil actual
```

**Usuarios** *(requiere rol Admin)*
```
GET    /api/users                   → Listar usuarios
POST   /api/users                   → Crear usuario
PUT    /api/users/:id               → Editar usuario
DELETE /api/users/:id               → Eliminar usuario
```

**Productos**
```
GET    /api/products                → Listar productos
GET    /api/products/:id            → Detalle de producto
POST   /api/products                → Crear producto [Admin]
PUT    /api/products/:id            → Editar producto [Admin]
DELETE /api/products/:id            → Eliminar producto [Admin]
GET    /api/products/low-stock      → Productos con stock crítico
```

**Inventario**
```
GET    /api/inventory/movements     → Historial de movimientos
POST   /api/inventory/movements     → Registrar movimiento [Admin]
```

**Ventas**
```
GET    /api/sales                   → Listar ventas
POST   /api/sales                   → Registrar venta
GET    /api/sales/:id               → Detalle de venta
```

**Reportes** *(requiere rol Admin)*
```
GET    /api/reports/sales           → Ventas por período
GET    /api/reports/top-products    → Productos más vendidos
```

**Predicciones**
```
GET    /api/predictions/:productId  → Predicción por producto
GET    /api/predictions/recommendations → Recomendaciones generales
```

> Los logs de MongoDB no se exponen como endpoint propio en esta versión — se consultan directamente vía MongoDB Compass u otro cliente Mongo.

---

## Flujo de Integración

### Flujo 1: Login

```
Frontend → POST /api/auth/login → Gateway → POST /auth/login (Java)
Java: valida credenciales, genera JWT → Gateway → Frontend
Frontend: almacena JWT en localStorage (vía AuthContext)
```

### Flujo 2: Registro de venta

```
Frontend → POST /api/sales {items} → Gateway (verifica JWT)
→ POST /sales (Java)
Java: valida stock → persiste Sale + SaleDetails → descuenta stock
→ registra InventoryMovement tipo SALE
→ retorna objeto venta → Gateway → Frontend
```

### Flujo 3: Predicción de demanda

```
Frontend → GET /api/predictions/42 → Gateway (verifica JWT)
→ GET /predict/42 (Python)
Python: consulta MySQL → aplica modelo estadístico
→ persiste predicción → retorna {weeklyForecast, monthlyForecast, confidence}
→ Gateway → Frontend: renderiza resultado
```

### Flujo 4: Agente IA (experimental)

```
Usuario → escribe pregunta en AgentBubble (frontend)
AgentBubble → POST https://api.groq.com/openai/v1/chat/completions
Groq (Llama 3.3 70B): procesa con contexto del módulo actual
→ retorna respuesta en lenguaje natural → AgentBubble renderiza mensaje
```

> El agente opera de forma completamente independiente al gateway y los servicios internos. No requiere autenticación JWT para funcionar.

### Flujo 5: Logging de requests (MongoDB)

```
Cliente → cualquier request → Gateway
Gateway: procesa la petición normalmente y responde al cliente
Gateway (en paralelo, sin bloquear la respuesta):
   mongoLogger registra { método, ruta, statusCode, ip, responseTimeMs } → MongoDB
```

> Este flujo corre en paralelo al resto — nunca retrasa ni condiciona la respuesta que recibe el cliente.

---

## Guía de Instalación y Ejecución

### Prerrequisitos

- **Docker** con Docker Compose v2 (recomendado: levanta todo el sistema)
- Opcional, para correr los servicios fuera de Docker: Node.js 20 LTS, Java 17 JDK, Maven 3.x, Python 3.11+ y MySQL 8.x

### Inicio rápido (Docker)

1. Crea tu archivo de variables de entorno a partir de la plantilla y reemplaza **todos** los valores:

```bash
cp .env.example .env
# Genera valores aleatorios fuertes con:  openssl rand -hex 32
```

   Variables obligatorias: `MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD`, `JWT_SECRET` e `INTERNAL_API_KEY`. El resto (dueño de la plataforma, CAPTCHA, asistente IA...) está descrito en `.env.example` y en el manual técnico. El `.env` no se sube al repositorio.

2. Levanta el sistema con recarga automática en desarrollo:

```bash
docker compose up --build --watch
```

   - Frontend: <http://localhost:5173> · Gateway: <http://localhost:3000>
   - Solo el gateway y el frontend se publican al host; MySQL, backend y analytics solo son accesibles dentro de la red de Docker (MySQL también en `127.0.0.1:3306` en desarrollo).
   - En desarrollo se cargan **datos de ejemplo**: inicia sesión con `admin@stockmind.com` (administrador) o `vendedor1@stockmind.com` (vendedor). La contraseña de ejemplo está en el comentario de `backend/src/main/resources/db/dev/seed.sql`. **Solo desarrollo.**
   - Los enlaces de verificación de correo del registro aparecen en el log del backend (`docker compose logs backend`) mientras no haya un proveedor de correo.

3. Para reiniciar la base con los datos de ejemplo (borra los datos de desarrollo):

```bash
docker compose down -v
```

### Pruebas

```bash
cd backend   && mvn test              # 85 pruebas (H2); con MYSQL_TEST_URL corre contra MySQL real
cd gateway   && npm test              # 122 pruebas
cd frontend  && npx vitest run        # 55 pruebas
cd analytics && python -m pytest      # 65 pruebas (+4 contra MySQL real con ANALYTICS_MYSQL_HOST)
```

El CI (`.github/workflows/ci.yml`) las ejecuta en cada push y pull request.

### Ejecutar los servicios fuera de Docker (opcional)

El esquema de la base lo crea **Flyway** al arrancar el backend (migraciones en `backend/src/main/resources/db/migration/`); solo hace falta una base vacía `stockmind_db` y un usuario con permisos sobre ella. Cada servicio lee sus variables de entorno (ver `.env.example`):

```bash
cd backend   && mvn spring-boot:run        # http://localhost:8080 (perfil dev: SPRING_PROFILES_ACTIVE=dev)
cd analytics && pip install -r requirements.txt && python app.py   # http://localhost:8000
cd gateway   && npm install && npm start   # http://localhost:3000 (exige JWT_SECRET e INTERNAL_API_KEY)
cd frontend  && npm install && npm run dev # http://localhost:5173
```

### Asistente IA (apagado por ahora)

El asistente consulta Groq **desde el gateway** (la clave nunca llega al navegador). Está desactivado por defecto; para reactivarlo define `AGENT_ENABLED=true` y `GROQ_API_KEY` en el `.env` y recrea el gateway.

---

*StockMind v1.4.0 — BlackLabs Dev*
