# StockMind — Propuesta de planes, precios y rentabilidad

**Estado:** propuesta para decidir (noviembre 2026) · **Modelo editable:** [`StockMind_Modelo_Financiero.xlsx`](StockMind_Modelo_Financiero.xlsx)

> Las cifras de impuestos, comisiones y costos son **estimaciones con fuentes públicas** (listadas al final) y deben validarse con tu contador y con cada proveedor antes de publicar precios. Este documento no es asesoría tributaria ni financiera.

---

## 1. Planes propuestos

Precios por mes en COP. **Siempre se cotizan "+ IVA"**: el cliente paga precio + 19 % de IVA, y ese IVA es de la DIAN, no ingreso tuyo.

| | **Starter** | **Pro** | **Business** |
|---|---:|---:|---:|
| Precio sin IVA | $59.900 | $119.900 | $249.900 |
| IVA (19 %) | $11.381 | $22.781 | $47.481 |
| **Precio que paga el cliente** | **$71.281** | **$142.681** | **$297.381** |
| Plan anual sin IVA (2 meses gratis) | $599.000 | $1.199.000 | $2.499.000 |
| Usuarios incluidos | 2 | 5 | 15 |
| Productos activos | 300 | 3.000 | 20.000 |
| Usuario adicional (sin IVA/mes) | $15.000 | $15.000 | $12.000 |

| Función | Starter | Pro | Business | Estado |
|---|:---:|:---:|:---:|---|
| Productos, inventario, movimientos | ✔ | ✔ | ✔ | Disponible |
| Punto de venta e historial | ✔ | ✔ | ✔ | Disponible |
| Dashboard y alertas de stock crítico | ✔ | ✔ | ✔ | Disponible |
| Usuarios y roles | ✔ | ✔ | ✔ | Disponible |
| Reportes de ventas y más vendidos | — | ✔ | ✔ | Disponible |
| Predicción de demanda y recomendaciones | — | ✔ | ✔ | Disponible |
| Exportación a Excel/PDF | — | ◐ | ◐ | Por construir |
| Asistente con IA | — | — | ◐ | En reconstrucción |
| Integraciones / API | — | — | ◐ | Por construir |
| Soporte | correo | correo prioritario | WhatsApp + correo | Definir horarios |

**Por qué estos precios:** Alegra y Siigo (software contable/de facturación, el competidor más cercano en la mente del cliente) rondan **$89.000–$191.000/mes** según las fuentes. StockMind es inventario + ventas + predicción, así que el Starter se ubica por debajo y el Pro/Business capturan a quien necesita predicción y más usuarios.

> **Honestidad comercial:** no vendas como incluido lo que aún está "por construir" (exportación, IA, API). Anúncialo como "próximamente" o no lo listes hasta que exista.

---

## 2. IVA, facturación y retenciones

- **IVA 19 %:** el SaaS está gravado en Colombia. Verifica con tu contador si aplica alguna tarifa distinta (una guía comercial menciona 5 % para algunas licencias; no se confirmó).
- **Factura electrónica:** cada cobro (mensual o anual) requiere factura electrónica DIAN a nombre de la empresa cliente (por eso el registro pide NIT). Necesitas un proveedor tecnológico autorizado (Alegra, Siigo, Factus u otro). Con pagos simulados aún no se factura nada: **la facturación real debe estar lista antes del primer cobro real.**
- **Retención en la fuente:** los clientes que son agentes retenedores te retendrán (≈4 % por servicios en 2026, base mínima 2 UVT) y posiblemente ReteICA. Es un **anticipo de impuestos**, no un costo, pero baja la plata que recibes. El IVA solo lo retienen entre responsables (ReteIVA 15 % del IVA).
- **Quién eres tributariamente importa:** persona natural, S.A.S. en régimen ordinario (35 % de renta) o régimen SIMPLE cambian cuánto de la utilidad se va en impuestos. Decídelo con el contador **antes** de facturar.

---

## 3. Ciclo de vida: prueba, cobro y suspensión

La prueba gratis de **14 días** ya existe (se activa al verificar el correo). Propuesta del ciclo completo:

```
TRIAL (14 días) ──► aviso día 9 (faltan 5) y día 13 (falta 1)
      │                         │
      │ paga (link de pago)     │ no paga
      ▼                         ▼
   ACTIVE ◄── paga ──── GRACIA (7 días, solo lectura, banner "renueva tu plan")
      │                         │ sigue sin pagar
      │ falla un cobro          ▼
      ▼                    SUSPENDED (no entra; los datos se conservan 90 días)
   PAST_DUE (3–7 días        │ pasa el plazo
   de reintento + avisos)    ▼
                         CANCELLED (se exportan o borran los datos según términos)
```

- **Avisos** por correo y banner dentro de la app (usa el `EmailSender` existente, que hoy solo escribe en el log en desarrollo; falta el proveedor real).
- **Gracia en solo lectura:** el cliente no pierde su información ni su operación de golpe; es la mejor palanca de conversión y evita reclamos.
- **Alta por teléfono:** el panel de plataforma crea la empresa y genera un **link de pago**; al confirmarse el pago, el plan queda activo. Decide si estas empresas reciben o no la prueba de 14 días (propuesta: no, porque ya hubo conversación comercial y pago acordado).
- **Pagos simulados (ahora):** una interfaz `PaymentProvider` con una implementación `Simulated` que genera un enlace interno y un "webhook" de prueba. Cuando contrates la pasarela (p. ej. Wompi) se agrega otra implementación sin cambiar el resto.

**Piezas técnicas de la Fase 3** (orden sugerido): tablas `plans`, `subscriptions` y `payments` · estados y límites por plan (`requireFeature` / `requireLimit` en el servidor) · comprobación del estado de la suscripción en cada petición con una caché corta (30–60 s) · tarea programada diaria para avisos y cambios de estado · `PaymentProvider` simulado · panel de plataforma (pausar, reactivar, cambiar plan, ver actividad).

---

## 4. Costos y rentabilidad (modelo en Excel)

**Por cliente (mezcla de 80 % mensual / 20 % anual):**

| | Starter | Pro | Business |
|---|---:|---:|---:|
| Ingreso mensual medio (sin IVA) | $57.903 | $115.903 | $241.570 |
| Margen de contribución | $44.425 (76,7 %) | $99.805 | $219.793 |
| LTV / CAC (churn 4 %, CAC $250.000) | 4,4× | 10,0× | 22,0× |
| Meses para recuperar el CAC | 5,6 | 2,5 | 1,1 |

**Escenarios mensuales** (con "dedicación del equipo" de $2.000.000, editable):

| | Conservador | Base | Optimista |
|---|---:|---:|---:|
| Clientes (Starter / Pro / Business) | 13 (8/4/1) | 35 (20/12/3) | 120 (60/45/15) |
| Ingresos sin IVA | $1,17 M | $3,27 M | $12,31 M |
| Utilidad **antes del equipo** | –$0,52 M | **+$1,25 M** | +$8,71 M |
| Utilidad neta (después del equipo e impuesto) | –$2,52 M | –$0,75 M | **+$4,36 M** |
| Clientes para el punto de equilibrio | ~47 | ~45 | ~43 |
| Clientes para cubrir costos **sin pagar al equipo** | ~20 | ~19 | ~20 |

**Lectura:**
- El negocio **se sostiene solo con ~20 clientes** (cubre infraestructura, contador, marketing y herramientas) y **empieza a remunerar al equipo (2 M) hacia los ~45**.
- **El Starter es el plan más débil:** deja ~$44 mil por cliente, y el soporte (0,5 h/mes ≈ $10.000) se come el 17 %. Funciona como puerta de entrada, pero la rentabilidad viene de Pro y Business. Si quieres acelerar el equilibrio: sube todos los precios ~15 % (el equilibrio baja a ~38 clientes), limita el soporte del Starter a correo o empuja el plan anual.
- **Costos que más pesan:** el equipo (si lo cuentas), el marketing y el contador. La **infraestructura es pequeña** (~$140 mil/mes para hasta 40 clientes), lo que responde tu duda inicial: 30 empresas usando el sistema 12 horas seguidas no es un problema técnico ni de costo.
- **Comisión de la pasarela:** ~4 % del cobro con IVA en el Starter (por el costo fijo de $700 más el IVA de la comisión); el plan anual la reduce a ~3 %.

**Qué no está en el modelo:** ingresos por usuarios adicionales (supuesto conservador), costo de desarrollo de las funciones "por construir", el costo de capital de trabajo, y los gastos de constitución de la empresa.

---

## 5. Supuestos a verificar (con fuente)

| Supuesto | Valor usado | Estado / fuente |
|---|---|---|
| IVA SaaS | 19 % | [Garrigues — SaaS, complejidad tributaria](https://www.garrigues.com/sites/default/files/noticias/files/software_as_a_service_saas_un_desafio_de_alta_complejidad_tributaria_en_un_mundo_digital_e_interconectado.pdf). Confirmar con contador |
| TRM | $3.182,99 (3-nov-2026) | [dolar-colombia.com](https://www.dolar-colombia.com/2026-11-03). Actualizar |
| Comisión de pasarela | 2,65 % + $700 + IVA | [Enter.co (Wompi)](https://www.enter.co/fintech/wompi-baja-la-tarifa-del-qr-al-1-y-amplia-los-pagos-desde-el-celular/). **No se halló la tabla oficial**: pedirla a Wompi/Bancolombia |
| Retención servicios / ReteICA | 4 % / 7,66 por mil | [Tabla de retención 2026, U. Distrital](https://viceadmin.udistrital.edu.co/tesoreria-general/sites/tesoreria/files/normativdad/2026-02/TABLA%20RETENCIONES%20VIGENCIA%202026.pdf). El ICA depende del municipio |
| Renta | 35 % ordinario | Régimen SIMPLE como alternativa: [Siempre al Día](https://siemprealdia.co/colombia/impuestos/regimen-simple-de-tributacion/). **No se halló la tarifa de software**: consultar contador |
| Competencia | Alegra $89.000–$163.900; Siigo $139.000–$191.000 | [Blog de Alegra](https://blog.alegra.com/colombia/alegra-vs-siigo-colombia/), [Guía de Software](https://www.guiadesoftware.com/alternativas/alegra). Las fuentes se contradicen: ver las páginas oficiales |
| Servidores | €4–16/mes por servidor | [Bitdoze (Hetzner)](https://www.bitdoze.com/md/hetzner-cloud-cost-optimized-plans.md); [alza de junio 2026](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do). Verificar en hetzner.com |
| Factura electrónica | $222 por documento | Referencia de un proveedor ([Sofisis](https://sofisis.com/static/sofisis_site/site/pdf/portafolio_facturacion_electronica_colombia.pdf?v=2.0.96)), sin fecha clara. Cotizar |
| Churn, CAC, conversión, horas de soporte, costo del equipo | 4 % · $250.000 · 25 % · 0,5 h · $2 M | **Supuestos propios**: ajústalos con datos reales apenas tengas clientes |

---

## 6. Decisiones que te tocan

1. **Precios y límites** de cada plan (usuarios, productos). ¿Mantienes el Starter en $59.900 o lo subes?
2. **Plan anual:** ¿2 meses gratis (pagas 10 de 12) o un descuento menor?
3. **Alta por teléfono:** ¿tiene prueba gratis o se activa al pagar?
4. **Política de gracia y suspensión:** 7 días de gracia en solo lectura y 90 días de retención de datos son propuestas, no decisiones.
5. **Cancelación y reembolsos:** qué pasa con un plan anual cancelado a mitad de año (debe quedar en los términos de servicio).
6. **Régimen tributario** de BlackLabs Dev y proveedor de facturación electrónica.
7. **Legal:** términos de servicio, política de privacidad y tratamiento de datos personales (habeas data, Ley 1581) antes de abrir la landing.
8. **Soporte:** horarios, canales por plan y quién lo atiende.
