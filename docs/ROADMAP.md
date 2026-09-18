# StockMind — Roadmap de Desarrollo

> Roadmap general del proyecto StockMind.
> 
> Objetivo: construir una aplicación de gestión de inventario moderna, funcional y escalable, manteniendo separadas las capas Frontend, Gateway y API Java Spring Boot.
>
> Estado actual: **v1.3.2**

---

# VERSIONES

## v1.0.0 — Base funcional

- [x] Estructura inicial del proyecto.
- [x] Frontend funcional.
- [x] Backend Java Spring Boot.
- [x] Gateway Node.js / Express.
- [x] Autenticación.
- [x] Gestión de usuarios.
- [x] Gestión de productos.
- [x] Inventario.
- [x] Ventas.
- [x] Predicciones.
- [x] Comunicación Frontend → Gateway → Java API.

---

## v1.1.0 — Integración y estabilidad

- [x] Integración de módulos principales.
- [x] Manejo inicial de errores.
- [x] Protección de rutas.
- [x] Control de roles.
- [x] Persistencia de información.
- [x] Correcciones generales de funcionamiento.

---

## v1.2.0 — Migración y consolidación

- [x] Migración progresiva de la interfaz HTML hacia React.
- [x] Organización de componentes.
- [x] Contexto de autenticación.
- [x] Componentes reutilizables.
- [x] Integración de API desde React.
- [x] Consolidación de módulos existentes.
- [x] Correcciones posteriores a la migración.

---

## v1.2.1 — Correcciones

- [x] Correcciones de errores introducidos durante la migración.
- [x] Ajustes de componentes React.
- [x] Correcciones de datos y estados.
- [x] Correcciones visuales iniciales.

---

# v1.3.0 — Rediseño Dark Glass / Glassmorphism

## Objetivo

Realizar el rediseño visual completo de StockMind utilizando una estética:

- Dark Glass.
- Glassmorphism.
- Moderna.
- Premium.
- Minimalista.
- Tecnológica.
- Consistente entre módulos.

La prioridad de esta versión es **el diseño y la experiencia visual**, sin modificar innecesariamente la lógica de negocio existente.

> **Nota:** durante esta versión se insertaron dos patches aislados (v1.3.1 y v1.3.2) por temas de backend/seguridad que no podían esperar al orden de fases de diseño. El trabajo de diseño de v1.3.0 sigue pendiente desde la Fase 2 (ver "PRÓXIMO PASO" al final del documento).

---

# 1.3.0 — Sistema visual global

## 1. Base visual

- [x] Definir fondo principal oscuro.
- [x] Definir superficies glass.
- [x] Definir bordes translúcidos.
- [x] Definir colores semánticos.
- [x] Definir color accent.
- [x] Definir color wine secundario.
- [x] Definir tipografías.
- [x] Definir radios.
- [x] Definir sombras.
- [x] Definir blur.
- [x] Definir transiciones.
- [x] Definir scrollbar.
- [x] Crear sistema visual reutilizable mediante variables CSS.

---

## 2. Componentes globales

- [x] Rediseñar botones.
- [x] Rediseñar inputs.
- [x] Rediseñar selects.
- [x] Rediseñar textareas.
- [x] Rediseñar badges.
- [x] Rediseñar tablas.
- [x] Rediseñar estados de carga.
- [x] Rediseñar toasts.
- [x] Rediseñar modales.
- [x] Crear estados hover/focus/active.
- [x] Mantener coherencia visual entre componentes.

---

## 3. Layout principal

- [x] Definir estructura general de la aplicación.
- [x] Sidebar.
- [x] Topbar.
- [x] Main content.
- [x] Sistema responsive inicial.
- [x] Separación visual entre navegación y contenido.

---

# 1.3.0 — Correcciones funcionales detectadas durante el rediseño

## 4. Usuarios

### 4.1 Botón de agregar usuario

- [x] Detectar pérdida del botón `+ Nuevo usuario` durante la migración HTML → React.
- [x] Restaurar botón `+ Nuevo usuario`.
- [x] Mantenerlo integrado con el diseño actual.
- [x] Mantener su funcionamiento existente.
- [x] Evitar modificar la API únicamente por el cambio visual.

---

### 4.2 Campo `updated_at`

- [x] Detectar problema donde `updated_at` podía quedar en `NULL`.
- [x] Inicializar correctamente `updatedAt`.
- [x] Actualizar `updatedAt` cuando corresponda.
- [x] Evitar inconsistencias entre creación y actualización de usuarios.

---

# v1.3.1 — Rate limiting en el gateway

> Septiembre 2026 · Patch aislado de backend, separado del rediseño visual de 1.3.0.

## Objetivo

Activar rate limiting en el API Gateway (estaba importado pero nunca aplicado, marcado como `//POR IMPLEMENTAR`), diferenciando rutas sensibles de la navegación normal entre módulos.

## Cambios

- [x] Activar `express-rate-limit` en `server.js`.
- [x] Límite estricto en `/api/auth/login` (10 intentos / 15 min) contra fuerza bruta.
- [x] Límite general en el resto de `/api` (600 peticiones / 5 min en producción, 5000 en desarrollo) para no bloquear la navegación normal entre módulos mientras se prueba.
- [x] `keyGenerator` pensado para identificar por usuario autenticado (`req.user.id`) con fallback a IP.

## Pendiente detectado (no bloqueante)

- [ ] El `apiLimiter` se monta antes de que `authenticate` decodifique el JWT dentro de cada archivo de rutas, así que por ahora sigue limitando por IP y no por usuario. Reordenar cuando se retome este módulo.

---

# v1.3.2 — Seguridad de sesión: JWT fuera de localStorage

> Septiembre 2026 · Patch aislado de seguridad, separado del rediseño visual de 1.3.0.

## Objetivo

Sacar el JWT de `localStorage` (vulnerable a robo vía XSS) y moverlo a una cookie `httpOnly`, inaccesible para JavaScript.

## Cambios — Gateway

- [x] `POST /api/auth/login` ya no devuelve el token en el body: lo setea como cookie `httpOnly` (`secure` + `sameSite` según entorno).
- [x] Nuevo endpoint `POST /api/auth/logout` que limpia la cookie del lado del servidor.
- [x] `GET /api/auth/me` lee el token desde la cookie (vía `authenticate`) en vez del header `Authorization`.
- [x] `cookie-parser` agregado a `package.json` y montado en `server.js`.
- [x] CORS ajustado (`credentials: true`, origin explícito por `FRONTEND_URL`) para permitir cookies entre frontend y gateway.
- [x] Helper centralizado `utils/authHeader.js`: reconstruye el header `Authorization` hacia Java a partir de la cookie, en un solo lugar en vez de repetirlo en cada archivo de rutas (`products`, `inventory`, `sales`, `users`, `reports`, `predictions`, `agent`).

## Cambios — Frontend

- [x] `api.js`: sin `localStorage`; `credentials: 'include'` en cada fetch; `Auth` ahora solo cachea el `user` en memoria.
- [x] `AuthContext.jsx`: restaura la sesión llamando a `/api/auth/me` al montar la app (estado `loading` mientras se confirma), en vez de leer un token guardado localmente.
- [x] `Login.jsx`: `login()` ya no recibe `token`, solo el `user` que devuelve el gateway.

## Bugs encontrados y corregidos durante la migración

- [x] 403 en todas las rutas protegidas: Java no recibía el token porque el gateway seguía leyendo el header `Authorization` (vacío) en vez de la cookie. Corregido centralizando la lógica en `authHeader.js`.
- [x] Bucle infinito de recarga: un 401 esperado de `/api/auth/me` (sin sesión aún) se trataba igual que un 401 de sesión caída, disparando `window.location.href` en loop. Corregido excluyendo `/auth/me` del auto-redirect.

## Relación con el problema conocido de la "pantalla negra" (sección 6 más abajo)

- [x] Como efecto colateral de este patch, ya no hay un JWT expirado "atascado" en `localStorage` que provoque el estado inconsistente original. Al recargar, `AuthContext` simplemente le pregunta al gateway (`/me`) si la cookie sigue siendo válida.
- [ ] Pendiente pulir la experiencia puntual: mostrar un mensaje explícito de "tu sesión expiró" en vez de solo devolver a Login en silencio, y confirmar en pruebas reales que no queden loops de redirección en ningún flujo.

---

# 1.3.0 — Autenticación y persistencia de sesión

> Problemas detectados durante las pruebas reales de la aplicación.

## 5. Token JWT almacenado en `localStorage`

### Estado

**Resuelto en v1.3.2.** El JWT ya no se almacena en `localStorage`; vive en una cookie `httpOnly` que JavaScript no puede leer.

### Pendientes restantes

- [ ] Documentar la estrategia definitiva de autenticación (cookie httpOnly + access/refresh) en un README o wiki interno.
- [ ] Evaluar separar access token (corto) y refresh token, para reducir aún más la ventana de exposición si el JWT_EXPIRATION de 24h se considera demasiado largo.

---

# 1.3.0 — Manejo de token expirado

## 6. Pantalla negra al reabrir la aplicación

### Estado

**Mitigado como efecto colateral de v1.3.2** (ver arriba). Al ya no depender de `localStorage`, el escenario original (token expirado atascado, estado inconsistente, pantalla negra) deja de poder ocurrir de la misma forma: `AuthContext` valida la sesión contra el gateway en cada carga.

### Pendientes restantes

- [ ] Confirmar con pruebas reales (cerrar la app, esperar a que expire el JWT de 24h, reabrir) que redirige a Login limpio y sin loops.
- [ ] Mostrar un mensaje claro ("tu sesión expiró, vuelve a iniciar sesión") en vez de solo redirigir en silencio.
- [ ] Evitar llamadas innecesarias a otras rutas mientras `AuthContext` todavía está resolviendo `loading`.

---

# 1.3.0 — Navegación

## 7. Sidebar

### Objetivo

Crear una navegación lateral moderna, flotante y coherente con el sistema Dark Glass.

### Pendientes

- [ ] Rediseñar Sidebar.
- [ ] Sidebar flotante.
- [ ] Logo de StockMind.
- [ ] Iconos de navegación.
- [ ] Separadores de secciones.
- [ ] Estado activo.
- [ ] Glow del elemento activo.
- [ ] Perfil del usuario.
- [ ] Rol del usuario.
- [ ] Botón de logout.
- [ ] Estados hover.
- [ ] Estados active.
- [ ] Transiciones.
- [ ] Adaptación responsive.

### Archivo principal

`frontend/src/components/layout/Sidebar.jsx`

### Restricción

En esta fase:

- No modificar autenticación.
- No modificar permisos.
- No modificar rutas.
- No modificar APIs.

La fase debe concentrarse en la **presentación y navegación visual**.

---

# 1.3.0 — Topbar

## 8. Topbar

### Pendientes

- [ ] Crear Topbar flotante.
- [ ] Título de página.
- [ ] Subtítulo/descripción.
- [ ] Fecha.
- [ ] Estado del sistema.
- [ ] Indicador visual de conexión.
- [ ] Diseño Glass.
- [ ] Estados responsive.

---

# 1.3.0 — Dashboard

## 9. Dashboard

### Pendientes

- [ ] Rediseñar tarjetas estadísticas.
- [ ] Mejorar jerarquía visual.
- [ ] Aplicar Glassmorphism.
- [ ] Indicadores de stock.
- [ ] Indicadores de ventas.
- [ ] Alertas de stock bajo.
- [ ] Resumen de actividad.
- [ ] Estados de carga.
- [ ] Estados vacíos.
- [ ] Responsive.

---

# 1.3.0 — Productos

## 10. Products

### Pendientes

- [ ] Rediseñar listado de productos.
- [ ] Rediseñar encabezado.
- [ ] Mejorar buscador.
- [ ] Mejorar filtros.
- [ ] Rediseñar tabla/listado.
- [ ] Badges de stock.
- [ ] Indicadores de stock bajo.
- [ ] Botón de agregar producto.
- [ ] Acciones de edición.
- [ ] Acciones de eliminación.
- [ ] Modal de creación.
- [ ] Modal de edición.
- [ ] Estados de carga.
- [ ] Estados vacíos.
- [ ] Responsive.

### Restricción

Primero diseño.

No modificar las APIs ni las funciones existentes hasta que el diseño quede aprobado.

---

# 1.3.0 — Inventario

## 11. Inventory

### Estado

El módulo ya cuenta con funcionalidad existente para:

- Historial de movimientos.
- Entrada.
- Salida.
- Venta.
- Ajuste.
- Devolución.
- Producto.
- Cantidad.
- Stock antes.
- Stock después.
- Motivo.
- Usuario.
- Fecha.
- Registro de movimientos mediante modal.

### Objetivo de esta fase

Rediseñar visualmente el módulo sin alterar inicialmente su lógica.

### Pendientes

- [ ] Rediseñar encabezado del historial.
- [ ] Rediseñar botón `+ Registrar movimiento`.
- [ ] Mejorar visualización de movimientos.
- [ ] Mejorar badges de tipos de movimiento.
- [ ] Mejorar visualización de cantidades positivas/negativas.
- [ ] Mejorar columnas de stock.
- [ ] Mejorar visualización de usuario y fecha.
- [ ] Mejorar estados vacíos.
- [ ] Mejorar estado de carga.
- [ ] Rediseñar modal de registro.
- [ ] Mejorar campos del formulario.
- [ ] Mejorar selección de producto.
- [ ] Mejorar selección de tipo.
- [ ] Mejorar campo cantidad.
- [ ] Mejorar campo motivo.
- [ ] Adaptar tabla para pantallas pequeñas.

### Restricción

Primero diseño.

No tocar:

- API de inventario.
- API de productos.
- Endpoints.
- Funciones de registro.
- Estructura de datos.

Hasta finalizar y aprobar la parte visual.

---

# 1.3.0 — Ventas

## 12. Sales

### Pendientes

- [ ] Rediseñar selector de productos.
- [ ] Rediseñar carrito.
- [ ] Mejorar tarjetas de productos.
- [ ] Mejorar cantidades.
- [ ] Mejorar controles `+ / -`.
- [ ] Mejorar total.
- [ ] Mejorar botón de finalizar venta.
- [ ] Estados vacíos.
- [ ] Estados de carga.
- [ ] Responsive.
- [ ] Aplicar Glassmorphism.

---

# 1.3.0 — Predicciones

## 13. Predictions

### Pendientes

- [ ] Rediseñar selector de productos.
- [ ] Rediseñar lista lateral.
- [ ] Mejorar información de predicción.
- [ ] Mejorar valores calculados.
- [ ] Mejorar indicador de confianza.
- [ ] Mejorar barra de confianza.
- [ ] Mejorar recomendación de cantidad.
- [ ] Mejorar badge del modelo.
- [ ] Estados vacíos.
- [ ] Estados de carga.
- [ ] Responsive.

---

# 1.3.0 — Responsive

## 14. Adaptación móvil

### Pendientes

- [ ] Revisar Sidebar en móvil.
- [ ] Revisar Topbar.
- [ ] Revisar tablas.
- [ ] Revisar modales.
- [ ] Revisar formularios.
- [ ] Revisar botones.
- [ ] Revisar tarjetas.
- [ ] Revisar Dashboard.
- [ ] Revisar Inventory.
- [ ] Revisar Sales.
- [ ] Revisar Predictions.
- [ ] Evitar overflow horizontal innecesario.
- [ ] Mantener legibilidad en pantallas pequeñas.

---

# 1.3.0 — Calidad y estabilidad

## 15. Revisión general

### Pendientes

- [ ] Revisar errores de consola.
- [ ] Revisar warnings de React.
- [ ] Revisar estados de carga.
- [ ] Revisar estados vacíos.
- [ ] Revisar manejo de errores.
- [ ] Revisar responsive.
- [ ] Revisar navegación.
- [ ] Revisar modales.
- [ ] Revisar formularios.
- [x] Revisar persistencia de sesión. *(cubierto por v1.3.2 — cookie httpOnly + `/me` al montar)*
- [ ] Revisar expiración del JWT.
- [ ] Revisar comportamiento al cerrar/reabrir la aplicación.
- [ ] Revisar que ninguna pantalla quede negra.
- [ ] Verificar que los cambios visuales no rompan funcionalidades existentes.

---

# ORDEN DE TRABAJO

Para evitar romper funcionalidades existentes, el desarrollo seguirá este orden:

## Fase 1 — Diseño global

- [x] Sistema Dark Glass.
- [x] Variables CSS.
- [x] Componentes globales.
- [x] Base responsive.

## Fase 2 — Sidebar

- [ ] Rediseño visual.
- [ ] Navegación.
- [ ] Perfil.
- [ ] Logout.
- [ ] Responsive.

## Fase 3 — Topbar

- [ ] Rediseño visual.
- [ ] Fecha.
- [ ] Estado.
- [ ] Responsive.

## Fase 4 — Dashboard

- [ ] Rediseño completo.

## Fase 5 — Productos

- [ ] Rediseño completo.

## Fase 6 — Inventario

- [ ] Rediseño completo.

## Fase 7 — Ventas

- [ ] Rediseño completo.

## Fase 8 — Predicciones

- [ ] Rediseño completo.

## Fase 9 — Autenticación y sesión

- [x] Manejo de JWT expirado. *(resuelto vía cookie httpOnly + `/me`, ver v1.3.2)*
- [x] Evitar pantalla negra. *(mitigado como efecto colateral de v1.3.2; pendiente pulir mensaje de expiración)*
- [x] Limpieza automática de sesión inválida. *(vía `/api/auth/logout` y manejo de 401 en `api.js`)*
- [x] Redirección al Login. *(cubierta por el flujo de `AuthContext` + `Login.jsx`)*
- [x] Revisar almacenamiento del token. *(migrado a cookie `httpOnly`, v1.3.2)*
- [ ] Evaluar estrategia de cookies HttpOnly. *(implementada; queda evaluar separar access/refresh token)*

## Fase 10 — Responsive final

- [ ] Revisión completa en desktop.
- [ ] Revisión tablet.
- [ ] Revisión móvil.

## Fase 11 — QA

- [ ] Pruebas de navegación.
- [ ] Pruebas de autenticación.
- [ ] Pruebas de expiración.
- [ ] Pruebas de roles.
- [ ] Pruebas de formularios.
- [ ] Pruebas de APIs.
- [ ] Pruebas de errores.
- [ ] Pruebas visuales.
- [ ] Pruebas responsive.

---

# REGLA PRINCIPAL DEL DESARROLLO

> **NO tocar funciones, APIs, endpoints ni lógica de negocio cuando el objetivo de la fase sea únicamente diseño.**

Cada módulo se trabajará en dos etapas:

### Etapa A — Diseño

Modificar únicamente:

- JSX necesario para estructura visual.
- CSS.
- Componentes visuales.
- Layout.
- Estados visuales.

### Etapa B — Funcionalidad

Una vez aprobado el diseño:

- Revisar lógica.
- Revisar API.
- Corregir errores.
- Mejorar validaciones.
- Mejorar manejo de estados.
- Integrar nuevas funcionalidades.

---

# PROBLEMAS CONOCIDOS

## [RESUELTO] Botón `+ Nuevo usuario`

El botón se perdió durante la migración HTML → React.

Estado:

**Corregido en v1.3.0**

---

## [RESUELTO] `updated_at` en NULL

Se detectó que `updated_at` podía quedar en `NULL`.

Estado:

**Corregido en v1.3.0**

---

## [RESUELTO] Rate limiting sin aplicar

El rate limiting estaba importado en el gateway pero nunca se aplicaba (`//POR IMPLEMENTAR`).

Estado:

**Corregido en v1.3.1** — límite estricto en login, límite general diferenciado por entorno (dev/prod).

---

## [RESUELTO] JWT almacenado en localStorage

El token permanecía en `localStorage`, accesible desde JavaScript (riesgo de robo vía XSS).

Estado:

**Corregido en v1.3.2** — el JWT ahora vive en una cookie `httpOnly`.

---

## [MITIGADO] Token expirado provoca pantalla negra

Cuando la aplicación se volvía a abrir con un JWT expirado almacenado en `localStorage`, el estado de autenticación no se resolvía correctamente y la aplicación podía quedar en pantalla negra.

Estado:

**Mitigado en v1.3.2** como efecto colateral de sacar el JWT de `localStorage`. Pendiente pulir el mensaje de "sesión expirada" y confirmar con pruebas reales de expiración de 24h.

---

# PRÓXIMO PASO

## v1.3.0 — Fase 2

### Sidebar

Archivo principal:

`frontend/src/components/layout/Sidebar.jsx`

Prioridad:

**DISEÑO**

No modificar todavía:

- APIs.
- Autenticación.
- Permisos.
- Endpoints.
- Lógica de negocio.

Después:

**Topbar → Dashboard → Products → Inventory → Sales → Predictions → Responsive → QA**