# StockMind — Correo transaccional (Resend)

StockMind envía correos en tres casos: **verificación de cuenta** (autoregistro), **avisos de la suscripción** (a 5 y 1 día del fin de la prueba o del plan, inicio de la gracia y suspensión) y un **correo de prueba** que lanza el Dueño desde el panel. Todo sale por una interfaz (`EmailSender`); hoy hay un proveedor real, **Resend**.

## Activarlo (5 pasos)

1. **Llave de API:** en Resend → *API Keys* → *Create API Key* (permiso "Sending access" basta). Empieza por `re_`. Cópiala una sola vez.
2. **Dominio:** en Resend → *Domains* → *Add Domain* con el dominio desde el que enviarás (por ejemplo `blacklabsdev.com`). Resend te muestra unos registros DNS (SPF y DKIM) que debes crear donde administras el dominio. Cuando Resend marque el dominio como *Verified*, ya puedes enviar a cualquier destinatario.
   - **Sin dominio (solo para probar):** usa `onboarding@resend.dev` como remitente. Resend entrega únicamente a la dirección con la que te registraste en Resend.
3. **Variables en el `.env` de la raíz** (el `.env` no se sube a Git):
   ```
   STOCKMIND_EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM=StockMind <no-responder@tu-dominio.com>
   EMAIL_REPLY_TO=soporte@tu-dominio.com
   ```
   `EMAIL_REPLY_TO` es opcional (a dónde llegan las respuestas de los clientes).
   `EMAIL_LOGO_URL` también es opcional: la dirección pública `https` del PNG del logo (por ejemplo `https://app.tu-dominio.com/brand/logo-color.png`) para el encabezado de los correos. Sin ella el encabezado lleva el nombre en texto (ver `MARCA.md`).
4. **Reinicia el backend:** `docker compose up -d --force-recreate backend`. En el log debe aparecer `Correo: Resend activo (remitente ...)`.
   Si falta la llave o el remitente está mal escrito, **el backend no arranca** y dice qué falta (mejor que fallar en silencio).
5. **Compruébalo:** en el panel, *Equipo → Correo del sistema → Enviar correo de prueba*. Si falla, el mensaje trae el motivo que da Resend (dominio sin verificar, llave inválida, destinatario no permitido en modo prueba...).

## Qué pasa si el correo falla
- **Verificación de cuenta:** el registro no se cae; el error queda en el log y el cliente puede pedir el reenvío del enlace.
- **Avisos de la suscripción:** el aviso **no se marca como enviado**; el ciclo diario (06:00) lo reintenta en la siguiente corrida, y una sola vez cuando el proveedor se recupera.
- **Correo de prueba:** responde 502 con el motivo.

## Seguridad
- La llave vive solo en variables de entorno; **nunca** se escribe en los logs ni en los mensajes de error.
- Los nombres de usuario y empresa se **escapan** en el HTML: nadie puede inyectar contenido en un correo que enviamos nosotros.
- El enlace de verificación es de un solo uso y vence a las 24 h; el log de producción no lo escribe.
- Los correos llevan texto plano además de HTML, para clientes que no muestran HTML.

## Límites y costos (verifícalos en la página de precios de Resend)
El plan gratis de Resend ha dado unos 3.000 correos al mes y 100 al día, suficiente para empezar. Cada cliente nuevo genera 1 correo de verificación y unos 2–4 avisos por ciclo.

## Desarrollo
Sin `STOCKMIND_EMAIL_PROVIDER`, en desarrollo (perfil `dev`) el enlace de verificación se escribe en el log del backend, como hasta ahora. Con el proveedor activo en desarrollo, los correos salen de verdad (con las restricciones del modo prueba si no hay dominio).

## Otro proveedor
Es una clase que implementa `EmailSender` (`sendVerificationEmail`, `sendBillingNotice`, `sendTestEmail`, `provider`) y una propiedad `STOCKMIND_EMAIL_PROVIDER` distinta; el resto del sistema no cambia.
