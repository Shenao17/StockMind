# StockMind — Plan de integración con Wompi

**Estado:** plan (nada implementado aún) · **Fecha de la investigación:** 6-nov-2026 · **Fuente:** documentación oficial `docs.wompi.co/en/docs/colombia/*` + los manuales de marca de la carpeta `WOMPI/`.

> Lo que dice este documento sale de la documentación pública. Donde la documentación se contradice o no dice nada, está marcado como **⚠ verificar**. Las tarifas y los requisitos de apertura de cuenta **no están en la documentación técnica** (están en `wompi.com/es/co/planes-tarifas/` y en `comercios.wompi.co`) y hay que consultarlos antes de decidir.

---

## 1. Qué hay en la carpeta `WOMPI/`

Solo es material de **marca**, no técnico:

| Archivo | Contenido |
|---|---|
| `WOMPI_Manual_2022_v3.pdf` (52 MB, 73 págs.) | Manual de comportamiento de marca (abril 2025): logotipo, colores, tipografía, tono. |
| `Manual-uso-digital.pdf` (57 MB) | Cómo mostrar el logotipo + medios de pago (Plan Avanzado Agregador, Puntos Colombia, Compra y Paga Después) y el sello PCI nivel 1. |
| `AllVersions.zip` y `AllVersions/` | Logos e íconos (`.svg`, `.png`, `.ai`, `.jpg`) + basura de macOS (`__MACOSX`, `.DS_Store`). |

Reglas de marca útiles para la pantalla de pago: logo solo sobre blanco, negro (`#2C2A29`) o verde menta (`#B0F2AE`); sin degradados, sin cambiar color ni posición, sin fondos con patrones. Colores: menta `#B0F2AE`, azul cielo `#99D1FC`, selva `#00825A`, lima `#DFFF61` (solo íconos/filetes).

**Recomendación de repositorio:** la carpeta pesa 108 MB. No la subas completa a Git; guarda solo 1–2 `.svg` en `frontend/public/` y deja los PDFs fuera (por ejemplo, agregar `WOMPI/` al `.gitignore`).

---

## 2. Cómo trabaja Wompi (resumen técnico)

- **Ambientes:** sandbox `https://sandbox.wompi.co/v1` y producción `https://production.wompi.co/v1`. Son independientes: cada uno tiene sus llaves y su propia URL de eventos. ⚠ Los ejemplos de tokenización usan `https://api.wompi.co/v1`; confirmar al integrar.
- **4 secretos** (se obtienen en `comercios.wompi.co`):

| Secreto | Prefijo | Uso | Dónde vive |
|---|---|---|---|
| Llave pública | `pub_test_` / `pub_prod_` | Widget/checkout, tokenizar | Puede ir en el frontend |
| Llave privada | `prv_test_` / `prv_prod_` | Crear/consultar transacciones y fuentes de pago | **Solo backend** |
| Secreto de eventos | `test_events_` / `prod_events_` | Validar la firma del webhook | **Solo backend** |
| Secreto de integridad | `test_integrity_` / `prod_integrity_` | Firmar el monto de cada cobro | **Solo backend** |

- **Medios de pago:** tarjeta crédito/débito (Visa, Mastercard), Nequi, PSE, botón Bancolombia, QR Bancolombia (solo personas naturales), DaviPlata (requiere activación comercial), corresponsal bancario, Puntos Colombia, entre otros. Moneda: solo COP.
- **Estados de una transacción:** `PENDING` → `APPROVED` | `DECLINED` | `VOIDED` (solo tarjeta) | `ERROR`. Ningún medio responde de forma síncrona: la confirmación llega después.
- **Referencia única:** una `reference` usada una vez en la cuenta no se puede reutilizar (422 "Duplicate reference").
- **PCI:** Wompi está certificado PCI nivel 1. StockMind **nunca debe tocar datos de tarjeta** (ni guardarlos ni recibirlos en su backend).

---

## 3. Cómo encaja con StockMind

El diseño del Fase 3 ya dejó el hueco exacto: la interfaz `PaymentProvider` y `PaymentService.markPaid(reference)` (idempotente). Solo hay que agregar una implementación y un webhook.

### 3.1 Cobro único (pago de un plan) — Web Checkout por redirección

Es la opción más simple y la que mejor cabe en lo que ya existe (enlaces de pago de la plataforma incluidos): no necesita JavaScript de Wompi en nuestro frontend.

```
Cliente / enlace de pago             StockMind                         Wompi
        │  POST /billing/checkout      │                                │
        ├─────────────────────────────►│ crea Payment PENDING (reference)│
        │                              │ firma = SHA256(reference +      │
        │                              │   monto_en_centavos + "COP" +   │
        │                              │   [expiración] + integrity)     │
        │◄── URL https://checkout.wompi.co/p/?public-key=…&currency=COP  │
        │    &amount-in-cents=…&reference=…&signature:integrity=…        │
        │    &redirect-url=…/pay/{ref}&expiration-time=…                 │
        ├───────────────────────────────────────────────────────────────►│ el cliente paga
        │◄─────────────── redirige a /pay/{ref}?id=<transaction_id> ─────┤
        │                              │◄── POST webhook transaction.updated
        │                              │ valida checksum + consulta GET /transactions/{id}
        │                              │ markPaid(reference) → plan ACTIVE
```

- `reference` = la referencia ya existente de `payments` (24 bytes aleatorios, ~32 caracteres; Wompi admite hasta 255). Cada intento de pago es un `Payment` nuevo → referencia nueva.
- `amount-in-cents` = total con IVA × 100 (entero). Ej.: Pro mensual = 142.681 → `14268100`.
- **Firma de integridad** (verificada en la documentación, con vector de prueba): `SHA-256(hex)` de `<reference><amountInCents><currency>[<expiration>]<integritySecret>`. Con el ejemplo oficial `sk8-438k4-xmxm392-sn2m2490000COPprod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6` el resultado debe ser `37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5` → será una prueba unitaria.
- `expiration-time` (ISO 8601 UTC) = los 48 h que ya tiene el enlace de pago.
- **La redirección no confirma nada**: Wompi lo dice explícitamente. La página `/pay/{ref}` solo consulta nuestro estado (polling corto) y muestra "procesando" hasta que el webhook marque el pago.
- Los impuestos en el checkout son informativos (no se suman al total); el IVA ya va dentro del monto.

### 3.2 Webhook (la parte crítica)

Endpoint nuevo, público, sin cookie: `POST /api/public/webhooks/wompi` (gateway → backend). Configurado en el panel de Wompi, una URL por ambiente.

Validación (en este orden, rechazando con 4xx si algo falla):
1. Leer el **cuerpo crudo** (el gateway debe pasarlo sin re-serializar: usar `express.raw` en esa ruta antes de `express.json`).
2. Checksum: `SHA-256` de la concatenación, **en orden**, de los valores indicados en `signature.properties` (se leen del propio evento, no se fijan en código) tomados de `data`, + `timestamp` (entero) + secreto de eventos. Comparar con `signature.checksum` / header `X-Event-Checksum` **en tiempo constante y sin distinguir mayúsculas**.
3. Defensa en profundidad: llamar `GET /v1/transactions/{id}` con la llave privada y confirmar `status = APPROVED`, que `reference` exista en `payments`, y que `amount_in_cents` y moneda coincidan con el cobro. Nunca confiar solo en el cuerpo recibido.
4. `APPROVED` → `markPaid(reference)` (idempotente). `DECLINED/ERROR/VOIDED` → marcar el intento como fallido (el cliente podrá reintentar con una referencia nueva). Transiciones solo desde `PENDING`: un evento atrasado o repetido no revierte un pago ya aprobado.
5. Responder **HTTP 200** (el cuerpo se ignora). Si no se responde 200, Wompi reintenta 3 veces en 24 h (a los 30 min, 3 h y 24 h).

⚠ Verificar en sandbox: el ejemplo de la documentación omite `timestamp` y `signature` en el cuerpo de muestra y la documentación mezcla `sent_at` (cuerpo) con timestamp UNIX para el checksum. Se resuelve capturando un evento real de sandbox y fijándolo como caso de prueba.

### 3.3 Renovaciones

Hay dos caminos; recomiendo empezar por el 1:

1. **Enlace de renovación (sin guardar medios de pago)** — el ciclo diario ya envía el aviso de "faltan 5/1 días"; solo hay que incluir un enlace que genere un `Payment` nuevo y lo lleve al checkout de Wompi. Cero datos sensibles, cero riesgo de cobros no deseados, y funciona con PSE/Nequi/transferencia. Es lo que ya tiene Billing.
2. **Cobro automático (fuente de pago)** — Wompi lo soporta: se tokeniza el medio, se crea una `payment_source` y en cada renovación el backend hace `POST /v1/transactions` con `payment_source_id`.
   - Tarjeta: tokenizar con el widget en modo `tokenize` (`data-widget-operation="tokenize"`) para que la tarjeta nunca pase por StockMind; luego `POST /v1/payment_sources` con la llave privada. El token de tarjeta es de **un solo uso**.
   - Requiere que el cliente acepte explícitamente las dos políticas (`acceptance_token` y `accept_personal_auth`, obtenidos de `GET /merchants/info`; el endpoint antiguo desaparecía el 31-oct-2026).
   - Nequi y DaviPlata se aprueban en el teléfono del cliente; Bancolombia por transferencia autorizada.
   - Para tarjetas Visa/Mastercard existe el indicador `recurrent` (Credential on File) para subir la tasa de aprobación. ⚠ La documentación se contradice sobre si es obligatorio; probar en sandbox.
   - Habría que modelar: tabla `payment_sources`, consentimiento registrado, qué pasa si un cobro falla (reintentos → gracia, que ya existe), cómo cancelar la fuente (`PUT /payment_sources/{id}/void`), y un aviso previo al cobro. Es una fase aparte.

### 3.4 Alta por teléfono (empresas creadas por el panel)

Ya funciona igual: el panel genera un enlace de pago (`/platform/organizations/{id}/payment-links`) y el cliente paga en el checkout de Wompi. El pago manual (`manual-payment`) se mantiene para transferencias bancarias fuera de la pasarela.

---

## 4. Cambios de código previstos

| Capa | Cambio |
|---|---|
| Backend | `WompiPaymentProvider` (`provider=wompi`; `checkoutUrl` arma la URL firmada); `WompiSignature` (integridad + verificación de eventos); `WompiClient` (RestClient con timeout hacia `GET /transactions/{id}`); `WompiWebhookController` (`/public/webhooks/wompi`, permitAll, sin CSRF/cookie); estado `FAILED` en pagos y registro de `provider_transaction_id` (migración V5); auditoría del evento. |
| Gateway | Ruta pública del webhook con cuerpo crudo, sin CORS, con rate limit propio y límite de tamaño; **no** requiere cookie/JWT. |
| Frontend | `/pay/:reference`: estados "procesando / aprobado / rechazado", reintento; logo y medios de pago de Wompi respetando el manual de marca. |
| Configuración | `STOCKMIND_PAYMENTS_PROVIDER=wompi`, `WOMPI_ENV` (`sandbox`/`production`), `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`, `WOMPI_INTEGRITY_SECRET`. Solo por variables de entorno/secretos; nunca en Git. Arranque falla si `provider=wompi` y falta algún secreto, o si se mezclan llaves `test` con ambiente de producción. |
| Pruebas | Vector oficial de firma; checksum válido/inválido/manipulado; evento repetido (idempotencia); monto distinto al cobro → rechazado; transacción que Wompi reporta `DECLINED` aunque el evento diga `APPROVED`; evento desordenado; webhook sin cabecera; prueba end-to-end contra sandbox con las tarjetas de prueba. |

**Datos de prueba de sandbox:** tarjeta `4242 4242 4242 4242` (aprobada), `4111 1111 1111 1111` (rechazada), cualquier otra → error; Nequi `3991111111` (aprobada) / `3992222222` (rechazada); PSE con banco "aprobado/rechazado".

### Probar el webhook en desarrollo

Wompi necesita una URL pública para enviar eventos. Opciones: un túnel (`cloudflared` / `ngrok`) apuntando al gateway :3000, registrando esa URL como "URL de eventos" del ambiente de pruebas. Sin eso solo se pueden probar la firma y el flujo con eventos simulados en tests.

---

## 5. Seguridad (lista de control)

- Secretos solo en variables de entorno del servidor; rotarlos si se exponen (el secreto de eventos y el de integridad son distintos y se regeneran en el panel de Wompi).
- Webhook: cuerpo crudo, comparación en tiempo constante, verificación cruzada contra la API, monto/moneda/referencia validados, idempotencia, rate limit, tamaño máximo, sin detalles de error al exterior.
- Nunca confiar en la redirección ni en lo que diga el navegador para activar un plan.
- No registrar (log) llaves, firmas completas ni datos del pagador.
- Anti-fraude: la llave privada jamás llega al frontend; la firma de integridad se calcula siempre en el backend.
- HTTPS obligatorio para la URL de eventos en producción.

---

## 6. Lo que NO está resuelto (necesito datos tuyos o de Wompi)

1. **Tarifas reales** (porcentaje + fijo por transacción, por medio de pago; costo de tokenización/recurrente; tiempos de abono). La documentación técnica solo remite a `wompi.com/es/co/planes-tarifas/`. En el modelo financiero se usa 2,65 % + $700 + IVA (fuente periodística, **no oficial**); en la prensa aparece además QR al 1 % y presencial 1,98 % + IVA.
2. **Apertura de cuenta:** requisitos (persona natural vs jurídica, RUT, cuenta bancaria, tiempos de aprobación, cuenta de producción vs sandbox). No aparece en la documentación; se ve en `comercios.wompi.co` o con soporte.
3. **Quién factura:** el comercio en Wompi será BlackLabs Dev; define su régimen tributario (afecta retenciones sobre lo que Wompi te abona) y el proveedor de factura electrónica DIAN. La facturación debe estar lista **antes** del primer cobro real.
4. **Cobro automático:** ¿lo quieres desde el lanzamiento o con enlace de renovación basta al inicio? (recomendado: enlace primero).
5. **Contradicciones de la documentación a confirmar en sandbox:** URL base de tokenización, obligatoriedad de `recurrent`, formato exacto del evento (`timestamp`/`sent_at`), si un intento rechazado permite reutilizar la misma referencia (el diseño asume que **no**: cada intento = referencia nueva).
6. **3D Secure** para tarjetas: la documentación lo enlaza en páginas aparte que no se revisaron; revisar antes de producción.

## 7. Fases propuestas

| Fase | Contenido | Depende de |
|---|---|---|
| 4a | Proveedor Wompi en **sandbox**: URL firmada, webhook verificado, `FAILED`, página `/pay` real, pruebas | Cuenta Wompi con llaves de sandbox |
| 4b | Endurecimiento: túnel de prueba, observabilidad del webhook, conciliación diaria (consultar pagos `PENDING` > 1 h contra la API), correo real de recibo | Proveedor de correo |
| 4c | Producción: llaves reales, HTTPS, factura electrónica DIAN, términos de servicio | Cuenta aprobada, contador |
| 4d (opcional) | Cobro automático con `payment_sources` y consentimiento | Decisión comercial |

---

## Fuentes

- Wompi Docs (Colombia): [Ambientes y llaves](https://docs.wompi.co/en/docs/colombia/ambientes-y-llaves/), [Widget y Web Checkout](https://docs.wompi.co/en/docs/colombia/widget-checkout-web/), [Transacciones](https://docs.wompi.co/en/docs/colombia/transacciones/), [Eventos](https://docs.wompi.co/en/docs/colombia/eventos/), [Fuentes de pago](https://docs.wompi.co/en/docs/colombia/fuentes-de-pago/), [Métodos de pago](https://docs.wompi.co/en/docs/colombia/metodos-de-pago/), [Links de pago](https://docs.wompi.co/en/docs/colombia/links-de-pago/), [Tokens de aceptación](https://docs.wompi.co/en/docs/colombia/tokens-de-aceptacion/), [Datos de prueba](https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/), [Inicio rápido](https://docs.wompi.co/en/docs/colombia/inicio-rapido/).
- Planes y tarifas oficiales (no consultadas): https://wompi.com/es/co/planes-tarifas/
- Prensa sobre tarifas: [Enter.co](https://www.enter.co/fintech/wompi-baja-la-tarifa-del-qr-al-1-y-amplia-los-pagos-desde-el-celular/).
- Carpeta local `WOMPI/` (manuales de marca).
