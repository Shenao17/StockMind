# StockMind — Guía de marca

Origen: el tablero `assets/Presentación de identidad de StockMind.png`. De él salen los archivos de `assets/brand/` (recortados, con fondo transparente) y las **versiones vectoriales** (`assets/brand/svg/`), trazadas a partir del tablero. La aplicación usa las copias de `frontend/public/brand/`.

## Qué logo va en cada lugar

| Fondo / uso | Archivo | Dónde se usa |
|---|---|---|
| Oscuro (principal) | `logo-color.svg` | Login, menú lateral, panel de plataforma, páginas de pago y verificación, correos |
| Claro, una tinta | `logo-azul-marino.svg` | PDF formal, Excel, facturas, documentos impresos |
| Sobre color o foto | `logo-blanco.svg` | Banners, bandas de color, presentaciones |
| Solo ícono | `icono-color.svg` (+ blanco y azul marino) | Menú compacto, marca de agua |
| Pestaña / app | `favicon.svg`, `favicon.ico`, `icon-192/512.png`, `apple-touch-icon.png` | `index.html` y `site.webmanifest` |
| Compartir enlace | `og-image.png` (1200×630) | Metadatos de `index.html` |
| Con eslogan, fondo claro | `logo-color-sobre-claro-eslogan.png` (solo PNG) | Firmas, propuestas comerciales |

En el código: `<BrandLogo variant="full|icon" tone="color|white|navy" height={…} />` (`frontend/src/components/ui/BrandLogo.jsx`). Si el logo va junto al nombre escrito, `alt=""`.

**Favicon:** va sobre una ficha azul noche (no transparente) para distinguirse en pestañas claras y oscuras, incluso a 16 px.

## Paleta

| Uso | Color |
|---|---|
| Fondo | `#090D19` |
| Superficie | `#14213D` |
| Primario | `#3978F6` |
| Acento cian | `#42D9E8` |
| Acento violeta | `#8065F5` |
| Texto / fondo claro | `#F4F6FC` |
| Degradado de marca | azul `#3978F6` → cian `#42D9E8` → violeta `#8065F5` |

En `frontend/src/index.css` son las variables `--accent` (azul), `--cyan`, `--violet`, `--gradient-brand` y `--gradient-brand-full`; los fondos `--bg*` y la superficie sólida se llevaron al azul noche de la marca.

## Reglas
- Respeta el espacio libre alrededor (como mínimo la altura de la "S"); no estires ni gires el logo; no lo pongas sobre fondos con poco contraste (el nombre en blanco desaparece sobre claro: usa la versión azul marino).
- Tamaño mínimo recomendado: logo completo 24 px de alto; ícono 16 px.
- No recolorees el logo fuera de las versiones de arriba.

## Correos
`EMAIL_LOGO_URL` (opcional) pone el logo en el encabezado. Debe ser una dirección pública `https` del **PNG** (`/brand/logo-color.png`); Gmail y Outlook a veces no muestran SVG ni imágenes bloqueadas. Sin ella, el encabezado lleva el nombre en texto. Se acepta solo `http(s)`; cualquier otra cosa se ignora.

## Reportes (PDF y Excel) — pendiente de construir
Cuando se construya la exportación se usarán: **PDF formal** (logo azul marino, una tinta) y **PDF comercial** (banda oscura con logo a color, tarjetas de totales, encabezado de tabla `#3978F6`); **Excel** con el logo azul marino en `B2:D4`, encabezado `#14213D` (formal) o `#3978F6` (comercial), filas alternas `#F4F6FC` y totales con borde `#42D9E8`. Las maquetas están en `assets/mockups/03-reportes-pdf.html` y `04-reportes-excel.html`.

## Calidad de los archivos y pendientes
- Los vectores son un **trazado fiel** del tablero (contornos suavizados): se ven nítidos a cualquier tamaño en pantalla, pero no sustituyen a un logo dibujado a mano. Para impresión de gran formato conviene rehacerlo en Figma o Illustrator y reemplazar los SVG.
- Las versiones del tablero no son idénticas entre sí (el cubo de la versión con eslogan difiere un poco); por eso esa variante solo existe en PNG.
- Pendiente: lavado de cara completo de la interfaz (esta entrega cambia logo, favicon y colores de marca, no la estructura de las pantallas).
