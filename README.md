# StockMind — Sistema Inteligente de Gestión de Inventario y Predicción de Demanda

> Plataforma web para la gestión de inventario y ventas con analítica predictiva integrada.

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
| Frontend | HTML + CSS + JavaScript | — (estático) |
| API Gateway | Node.js + Express | 3000 |
| Backend Principal | Java Spring Boot | 8080 |
| Microservicio Analítico | Python Flask | 8000 |
| Base de Datos | MySQL | 3306 |

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

**Dimensión técnica:** Cada tecnología cumple un rol específico y no intercambiable. Java Spring Boot provee robustez transaccional. Node.js actúa como gateway sin acoplamiento directo. Python aporta capacidad estadística madura (scikit-learn, statsmodels, pandas) que complementa al stack sin duplicar responsabilidades.

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
6. Desarrollar un frontend funcional en HTML, CSS y JavaScript que consuma exclusivamente las rutas del gateway Node.js.
7. Documentar el sistema con nivel de detalle suficiente para su reproducción técnica y presentación académica.

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

### Excluido

- Integración con pasarelas de pago reales
- Módulo de proveedores y órdenes de compra automatizadas
- Aplicación móvil nativa
- Modelos de machine learning avanzados (LSTM, Prophet)
- Multi-tenancy

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

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                      │
│         HTML + CSS + JavaScript (Vanilla)                 │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP/REST
                      ▼
┌──────────────────────────────────────────────────────────┐
│             API GATEWAY — Node.js + Express               │
│  · Verificación JWT centralizada                          │
│  · Proxy/enrutamiento a Java API o Python API            │
│  · CORS, logging, manejo de errores                      │
│  Puerto: 3000                                             │
└──────────────┬───────────────────────────┬───────────────┘
               │ HTTP/REST                 │ HTTP/REST
               ▼                           ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│  BACKEND Java Spring Boot│  │  MICROSERVICIO Python Flask │
│  · Lógica de negocio     │  │  · Análisis de historial    │
│  · Gestión de usuarios   │  │  · Predicción de demanda    │
│  · CRUD de productos     │  │  · Recomendaciones stock    │
│  · Ventas e inventario   │  │  Puerto: 8000               │
│  Puerto: 8080             │  └────────────┬───────────────┘
└──────────────┬───────────┘               │
               │ JDBC/JPA                  │ SQLAlchemy/mysql-connector
               └───────────────┬───────────┘
                               ▼
               ┌───────────────────────────────┐
               │         MySQL 8.x             │
               │  stockmind_db                 │
               │  Puerto: 3306                 │
               └───────────────────────────────┘
```

### Principio de diseño

El frontend **nunca** consume directamente el backend Java ni el microservicio Python. Todo el tráfico pasa por el gateway Node.js, que actúa como único punto de entrada, aplicando autenticación centralizada y enrutamiento transparente.

---

## Tecnologías Utilizadas

| Tecnología | Versión | Rol | Justificación |
|-----------|---------|-----|--------------|
| HTML5/CSS3/JS | ES2020+ | Frontend | Base de la web sin overhead de frameworks |
| Node.js | 20 LTS | API Gateway | I/O no bloqueante ideal para proxy de peticiones |
| Express | 4.x | Framework HTTP | Minimalista, robusto, ecosistema maduro |
| Java | 17 LTS | Backend | Tipado fuerte, robustez |
| Spring Boot | 3.x | Framework Java | Auto-configuración, Spring Security, JPA |
| Python | 3.11+ | Microservicio | Ecosistema estadístico sin equivalente |
| Flask | 3.x | Framework Python | Ligero, ideal para microservicio REST |
| MySQL | 8.x | Base de datos | ACID compliance, integridad referencial |
| pandas | 2.x | Analítica | Manipulación de series temporales |
| scikit-learn | 1.x | ML | Modelos de regresión y predicción |
| JWT | — | Autenticación | Stateless, compatible con arquitectura distribuida |

---

## Estructura de Carpetas

```
stockmind/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── api-endpoints.md
│   ├── database-design.md
│   ├── manual-tecnico.md
│   └── manual-usuario.md
│
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   ├── products.html
│   ├── inventory.html
│   ├── sales.html
│   ├── reports.html
│   ├── predictions.html
│   ├── users.html
│   ├── css/
│   │   ├── main.css
│   │   ├── components.css
│   │   └── dashboard.css
│   └── js/
│       ├── api.js
│       ├── auth.js
│       ├── products.js
│       ├── inventory.js
│       ├── sales.js
│       ├── reports.js
│       └── predictions.js
│
├── gateway/
│   ├── package.json
│   ├── server.js
│   ├── .env
│   └── src/
│       ├── config/config.js
│       ├── middleware/
│       │   ├── auth.middleware.js
│       │   ├── logger.middleware.js
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

---

## Flujo de Integración

### Flujo 1: Login

```
Frontend → POST /api/auth/login → Gateway → POST /auth/login (Java)
Java: valida credenciales, genera JWT → Gateway → Frontend
Frontend: almacena JWT en localStorage
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
→ Gateway → Frontend: renderiza gráfico
```

---

## Guía de Instalación y Ejecución

### Prerrequisitos

- Node.js 20 LTS
- Java 17 JDK
- Python 3.11+
- MySQL 8.x
- Maven 3.x

### 1. Base de datos

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p stockmind_db < database/seed.sql
```

### 2. Backend Java

```bash
cd backend
# Configurar application.properties con credenciales MySQL
mvn clean install
mvn spring-boot:run
# Disponible en http://localhost:8080
```

### 3. Microservicio Python

```bash
cd analytics
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Configurar config.py con credenciales MySQL
python app.py
# Disponible en http://localhost:8000
```

### 4. Gateway Node.js

```bash
cd gateway
npm install
# Configurar .env
npm start
# Disponible en http://localhost:3000
```

### 5. Frontend

Abrir `frontend/index.html` en el navegador o servir con cualquier servidor HTTP estático.

```bash
# Opción con Python
cd frontend
python -m http.server 5500
```

### Variables de entorno (gateway/.env)

```env
PORT=3000
JAVA_API_URL=http://localhost:8080
PYTHON_API_URL=http://localhost:8000
JWT_SECRET=stockmind_super_secret_key_2024
```

---

*Desarrollado como proyecto académico — StockMind v1.0* 
