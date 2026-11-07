# StockMind — Panel de plataforma (equipo de BlackLabs)

**Estado:** Fases (a), (b), (c) y (d) implementadas: roles y permisos, equipo, 2FA, ficha de empresa, resumen, cobros, auditoría, solicitudes con aprobación y editor de planes.
Detalle técnico en `docs/manual-tecnico.md` (secciones 5.6 y 6.5).

El panel `/platform` es para quien opera StockMind (no para las empresas clientes). Lo usa el equipo de BlackLabs con roles distintos.

---

## 1. Roles y permisos

| Rol | Para quién | Puede |
|---|---|---|
| `PLATFORM_OWNER` (Dueño) | Tú | Todo, incluida la gestión del equipo |
| `PLATFORM_BILLING` (Cobranza) | Finanzas | Ver empresas y **cobros**, crear empresas, reactivar, extender pruebas (≤ 7 días), generar enlaces de pago |
| `PLATFORM_SUPPORT` (Soporte) | Asesor técnico | Ver empresas (sin cobros), **corregir datos de contacto**, reactivar, extender pruebas (≤ 7 días) |
| `PLATFORM_VIEWER` (Consulta) | Socio / contador | Solo ver (incluye cobros) |

**Operaciones sensibles** (suspender, cancelar, cambiar de plan, registrar pago manual, extender pruebas más de 7 días, corregir el NIT): **solo el Dueño** las ejecuta directamente (permiso interno `SENSITIVE`). Soporte y Cobranza las **solicitan** con un motivo y el Dueño las aprueba o rechaza (sección 4.3).

Cada endpoint exige un **permiso** (`PERM_*`), no un rol concreto: así se pueden agregar roles sin tocar los endpoints. La matriz vive en `PlatformPermission.java`. El backend es quien decide; el gateway y el frontend solo ocultan lo que no corresponde.

Reglas del equipo (`/platform/team`, solo Dueño):
- Cada cambio exige el **PIN** del Dueño.
- No se crean otros dueños ni se modifica al Dueño desde el panel; nadie edita su propia cuenta.
- Desactivar a alguien o cambiarle el rol **cierra su sesión de inmediato**: la cuenta se revalida contra la base en cada petición.
- Alta: contraseña temporal (se muestra una sola vez); el miembro la cambia en su primer acceso.
- "Reiniciar acceso": nueva contraseña temporal, borra 2FA y PIN y cierra sus sesiones.
- Todo queda en `audit_log` (sin contraseñas ni PIN).

## 2. Inicio de sesión del equipo (mismo login que las empresas)

1. Correo y contraseña en el login normal. Si el usuario es de plataforma **no recibe sesión**: recibe un *desafío* de corta vida.
2. **Primer acceso:** (contraseña nueva si era temporal) + escanear el QR con una app autenticadora (Google/Microsoft Authenticator, Aegis…) + escribir el primer código + elegir un **PIN** de 6 a 10 dígitos. Se muestran **8 códigos de respaldo** una sola vez.
3. **Accesos siguientes:** código de 6 dígitos de la app (o un código de respaldo, de un solo uso).
4. Sesión de **2 horas** (las empresas tienen 24 h), en cookie httpOnly.

**Por qué app autenticadora y no un PIN fijo como único factor:** un PIN que siempre es igual lo vuelve a ver quien mire tecleando o lo adivine; el código de la app cambia cada 30 s, se genera en el celular sin correo ni SMS y no necesita internet. El **PIN se mantiene** como segunda confirmación para acciones sensibles (gestión del equipo hoy, aprobaciones mañana).

Protecciones:
- Código y PIN: 5 intentos fallidos → bloqueo de 15 minutos.
- Un código TOTP no se puede reutilizar (se guarda el último paso usado).
- El secreto TOTP se guarda **cifrado** (AES-256-GCM); el PIN y los códigos de respaldo, con hash.
- El token de desafío no sirve como sesión (no lleva rol; el gateway y el backend lo rechazan).
- `/api/auth/mfa/*` tiene el mismo límite de peticiones que el login.

## 3. Variables de entorno

| Variable | Uso |
|---|---|
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | Crean al **primer Dueño** si no existe ninguno (solo la primera vez). En su primer ingreso configurará 2FA y PIN. |
| `PLATFORM_ADMIN_NAME` | Nombre del Dueño (opcional). |
| `STOCKMIND_MFA_KEY` | Llave que cifra los secretos TOTP. **En producción define una propia** (distinta del `JWT_SECRET`); si falta se deriva del `JWT_SECRET` (solo desarrollo). Si la cambias, los miembros deberán reconfigurar su 2FA (reiniciar acceso). |

## 4. Fases

| Fase | Contenido | Estado |
|---|---|---|
| (a) | Roles y permisos, equipo, 2FA (app + PIN), contraseña temporal, sesiones revocables | ✔ hecho |
| (b) | Ficha de empresa: datos, uso frente a límites, usuarios, cobros, línea de tiempo; corregir contacto y NIT; reiniciar 2FA de usuarios | ✔ hecho |
| (c) | Resumen con métricas, pantalla de cobros y de auditoría | ✔ hecho |
| (d) | Solicitudes con aprobación del Dueño y editor de planes/precios | ✔ hecho |

## 4.1 Ficha de empresa (`/platform/orgs/:id`)

Se abre al pulsar el nombre de una empresa en el listado. Muestra, **sin ningún dato de negocio** (productos, ventas, clientes):
- **Datos:** razón social, NIT, correo, teléfono, país, origen, términos aceptados y si exige 2FA.
- **Plan y uso:** plan, estado, vencimiento, usuarios y productos activos frente al límite (la barra se pone roja al 90 %), funciones incluidas.
- **Usuarios:** todos (activos e inactivos) con rol y 2FA. El Dueño puede **reiniciar el 2FA** de uno (con su PIN).
- **Cobros** (solo con permiso de ver cobros; Soporte no los ve): fecha, plan, neto/IVA/total, estado (un enlace vencido se muestra "Vencido"). La referencia del enlace de pago nunca se muestra.
- **Línea de tiempo:** alta, términos, acciones de la auditoría (con quién y detalle) y cobros.
- **Correcciones:** contacto (nombre, razón social, teléfono, correo, país) por Dueño y Soporte, auditadas con el valor anterior y el nuevo; **NIT solo el Dueño con su PIN** (se normaliza, no puede repetirse).

## 4.2 Navegación, resumen, cobros y auditoría

Barra del panel (cada rol solo ve lo suyo): **Resumen** (`/platform`), **Empresas** (`/platform/companies`), **Cobros** (permiso de cobros), **Auditoría**, **Equipo** (solo Dueño).

- **Resumen:** suscripciones por estado (prueba, activas con cuántas son de cortesía, gracia, suspendidas), altas de los últimos 30 días y empresas sin verificar; **ingresos** (solo con permiso de cobros): cobrado este mes con neto/IVA y variación frente al mes anterior, **MRR** (ingreso mensual recurrente neto: mensual + anual ÷ 12, sin cortesías ni pruebas), cobros pendientes (enlaces vigentes) y fallidos de los últimos 30 días; listas de **pruebas por vencer (≤ 5 días)** y de empresas **en gracia**, enlazadas a su ficha; suscripciones vigentes por plan.
- **Cobros:** todas las empresas, con filtros (estado: pagado/pendiente/vencido/fallido; empresa, NIT o correo; fechas) y paginación. Muestra el **total pagado dentro del filtro sobre todas las páginas** (neto, IVA y total): útil para cuadrar con el contador. Nunca muestra la referencia de los enlaces de pago.
- **Auditoría:** quién hizo qué, sobre qué empresa y cuándo, con filtros por acción, persona y fechas; las acciones se muestran en español. Todos los roles del equipo la ven.
- Ninguna de las tres expone datos de negocio de las empresas.

## 4.3 Solicitudes con aprobación y editor de planes

**Solicitudes** (pestaña *Solicitudes*; el Dueño ve un contador de pendientes):
- Tipos: suspender, cancelar, cambiar plan, registrar pago manual, extender prueba (más de 7 días) y corregir NIT.
- **Quién pide:** Soporte y Cobranza (desde la lista de empresas, opción "Solicitar…", o desde la ficha), siempre con un **motivo** de 10 a 500 caracteres. Los parámetros se validan al pedir (plan que exista, días de 1 a 90, NIT con formato y que no exista). No puede haber dos solicitudes pendientes del mismo tipo para la misma empresa.
- **Quién decide:** solo el Dueño. **Aprobar exige su PIN** y ejecuta la acción en ese momento; si la acción falla (p. ej. el NIT ya lo tomó otra empresa) la solicitud sigue pendiente y ve el error. **Rechazar** exige una nota que verá quien pidió. Quien pidió puede **cancelarla** mientras esté pendiente.
- Una solicitud pendiente **vence a los 7 días** (se ve "Vencida" y ya no se aprueba).
- Cada miembro ve solo las suyas; el Dueño, todas. Todo queda en la auditoría: la acción aparece a nombre del Dueño con "solicitud #N de <quien pidió>".

**Editor de planes** (pestaña *Planes*, solo el Dueño, con PIN): nombre, precios (mensual y anual, sin IVA), usuarios, productos, usuario adicional, funciones incluidas y si el plan está activo.
- Los **límites y funciones** aplican de inmediato a las empresas que ya usan el plan; el **precio** aplica solo a los cobros nuevos (los ya generados conservan su monto).
- Reducir un límite por debajo del uso actual no borra nada: solo impide agregar más.
- Validaciones: precio mínimo $1.000, el anual no puede superar 12 meses del mensual, funciones conocidas, y el plan por defecto del registro (PRO) no se puede desactivar. Los planes **no se crean ni se borran** desde aquí (el código identifica sus suscripciones y cobros).
- Un plan desactivado deja de verse para contratar; las empresas que ya lo tienen lo conservan.

## 5. 2FA para las empresas clientes

Implementado junto al del equipo (ver `manual-usuario.md`, sección 9, y `manual-tecnico.md`, 5.7):
- Opcional por usuario desde **Seguridad**; el administrador de la empresa puede **exigirla a todos**.
- Sin PIN: solo app autenticadora + códigos de respaldo.
- Si alguien pierde el celular: su administrador le reinicia el 2FA desde **Usuarios**; si es el único administrador, lo reinicia el **Dueño de plataforma con su PIN** (endpoint listo; botón **Reiniciar 2FA** en la ficha de empresa). Cuando exista la fase (d), soporte podrá solicitarlo y el Dueño aprobarlo.

## 6. Pendientes y límites conocidos

- Pendiente natural: exportar cobros a CSV/Excel para el contador. Los ingresos son los cobrados en la plataforma; no incluyen retenciones ni comisiones de la pasarela.
- Un miembro desactivado o con otro rol ve errores 403 en lugar de volver al login hasta que recarga la página.
- No hay recuperación de acceso por correo: el Dueño reinicia el acceso de un miembro; si el **Dueño** pierde celular y códigos de respaldo hay que repararlo a mano en la base (borrar `mfa_*`/`pin_hash` de su fila).
- El cambio de contraseña obligatorio aplica al equipo de plataforma; las empresas creadas por teléfono aún no lo tienen.
- No hay "ver como la empresa" (acceso de soporte a los datos del cliente): se evaluará con consentimiento y auditoría (habeas data) en una fase posterior.
