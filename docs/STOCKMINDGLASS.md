# StockMindGlass — vidrio líquido de la interfaz

**Versión:** 1.5.1 · **Código:** `frontend/src/GlassUi/` (`GlassElement.js`, `displacement.js`) · **Pruebas:** `frontend/src/test/StockMindGlass.test.js`

Web Component `<glass-element>` que da el efecto de vidrio a los elementos flotantes de StockMind. Se registra solo al importarse (`main.jsx`).

## Modos

El componente elige el modo por su cuenta y lo deja anotado en el elemento (`data-glass-mode` y `data-glass-reason`):

| Modo | Qué hace | Cuándo se usa | Costo |
|---|---|---|---|
| `liquid` | Refracción real: filtro SVG `feDisplacementMap` dentro de `backdrop-filter` | Chromium de escritorio y Android, hasta **3 instancias a la vez** (`maxLiquid`) | Alto (GPU) |
| `lite` | Vidrio esmerilado solo con CSS (desenfoque, saturación y brillo) | Firefox, Safari, cualquier navegador en iOS, o cuando ya hay 3 en `liquid` | Bajo |
| `solid` | Superficie opaca | El sistema tiene activado "reducir transparencia" o alto contraste | Ninguno |
| `debug` | Muestra el mapa de desplazamiento | Atributo `debug` | — |

Razones posibles en `data-glass-reason`: `auto`, `requested`, `no-svg-backdrop`, `liquid-budget`, `reduced-transparency`, `forced-colors`, `error`, `debug`.

## Uso

```jsx
<glass-element
  interactive                 // efecto al presionar (mouse y táctil)
  width="52" height="52"      // tamaño fijo; o auto-size para que lo dé el contenido
  radius="16" depth="8" strength="28" blur="3"
  background-color="rgba(255,255,255,0.025)"
  mode="auto"                 // auto | liquid | lite | solid
>
  <button>…</button>
</glass-element>
```

| Atributo | Por defecto | Notas |
|---|---|---|
| `width`, `height` | 200 | px |
| `auto-size`, `min-width`, `min-height` | — | El contenido define el tamaño; se mide con `ResizeObserver` |
| `radius` | 50 | Se limita a la mitad del lado menor |
| `depth` | 10 | Se limita para que el mapa sea válido |
| `strength` | 100 | Fuerza de la refracción |
| `chromatic-aberration` | 0 | Separación de los canales RGB |
| `blur` | 2 | `liquid` usa la mitad y `lite` el doble (mínimo 6 px; 16 px con `sheen`) |
| `frost` | — | Escarcha del modo `liquid`. Va **dentro** del filtro SVG (`feGaussianBlur`), porque Chromium ignora un `blur()` de `backdrop-filter` que vaya junto a `url()` |
| `sheen` | apagado | Brillo especular en el borde y reflejo superior: da cuerpo de vidrio |
| `background-color` | `rgba(255,255,255,0.025)` | Tinte de la superficie |
| `mode` | `auto` | Fuerza un modo; `liquid` sigue sujeto al soporte y al tope |
| `interactive` | apagado | Cursor de mano, escala al presionar y más profundidad |
| `responsive`, `base-width`, `base-height` | — | Escala a 0,9 / 0,8 / 0,6 bajo 1024 / 768 / 480 px |
| `debug` | apagado | Muestra el mapa |

**Partes estilables:** `glass-element::part(surface)` y `::part(content)`. **Variable:** `--glass-solid-bg` (fondo del modo `solid`).

## Trazabilidad

- **En el elemento:** `data-glass-version`, `data-glass-mode`, `data-glass-reason` y `data-glass-state` (`ready` | `hidden` | `error`). Se pueden ver en el inspector del navegador.
- **Eventos** (burbujean y atraviesan el shadow DOM):
  - `glass-ready`: el efecto se aplicó por primera vez.
  - `glass-modechange` `{ mode, previous, reason }`.
  - `glass-error` `{ message }`: el elemento cae a `lite` en vez de quedar roto.
- **Consola del navegador:**
  ```js
  __STOCKMIND_GLASS__.stats()          // versión, instancias, modos, caché, contadores
  __STOCKMIND_GLASS__.configure({ maxLiquid: 2 })
  localStorage.setItem('stockmind:glass:debug', '1')   // registro detallado (recargar)
  ```
- **API:** `GlassElement.version`, `.configure({ maxLiquid, debug })`, `.stats()`, `.supportsLiquid()`, `.clearCache()`. Por elemento: `el.resolvedMode` y `el.refresh()`.

## Dónde se usa

**Solo en el botón del asistente** (`components/ui/AgentBubble.jsx`): modo `auto` (con refracción donde se pueda) e `interactive`. `main.jsx` fija `maxLiquid: 1`: si otra instancia apareciera por error, cae sola a `lite`.

**Decisión del 2026-11-08:** el vidrio consumía demasiada GPU para un software que se queda abierto todo el día en PCs de oficina. Las notificaciones y la campana usan ahora una superficie sin `backdrop-filter` (color casi opaco, degradado y brillo de borde pintados una sola vez), que casi no consume GPU. El punto rojo del asistente late 3 veces y se detiene: antes latía sin fin junto al vidrio y obligaba a recalcularlo en cada frame.

### Notificaciones (sin vidrio)

Motor: `hooks/useToast.js`. Se comparte por `NotificationContext` (`context/notificationState.js`) desde `App.jsx`.

- **Informativas** (`success`, `info`, `warning`, `error`):
  - Se cierran solas (4,5 / 4,5 / 6 / 7 s) con una barra de tiempo.
  - Se pausan con el mouse encima o al enfocarlas.
  - Las repetidas se agrupan ("×3").
- **Críticas** (`critical`):
  - No se cierran solas y van siempre primero, con `role="alert"` y una acción.
  - Al ocultarlas quedan en la campana hasta que se marcan como resueltas.
- **Ubicación:** arriba a la derecha, debajo de la barra superior (en celular, a todo lo ancho). Máximo 3 visibles; el resto aparece como "+N más".
- **Cómo usarlas:**
  - `showToast(mensaje, tipo)` sigue funcionando igual en todas las páginas.
  - `showToast({ type, title, message, action: { label, href | onClick } })` para la forma completa.
  - Fuera de React: `emitNotification({...})`.
- **Críticas automáticas:** `api.js` lanza una crítica ante `SUBSCRIPTION_READ_ONLY` y `SUBSCRIPTION_BLOCKED`, con un botón a `/billing`. El error que repita ese mismo texto no se muestra dos veces.
- **Errores legibles:** si el servidor responde con HTML, texto técnico o nada, `errorMessage()` lo cambia por un mensaje en español.
- **Asistente:** la burbuja no se muestra mientras `AGENT_ENABLED=false`.

## Reglas de uso

- `liquid` solo en elementos **pequeños y de tamaño fijo** (botón del asistente, tarjeta del login, selectores). En elementos que cambian de tamaño, `auto-size` regenera el mapa con cada medida nueva (queda en caché, pero cada tamaño distinto es una entrada).
- Como máximo 2 o 3 en `liquid` en pantalla; el tope lo hace cumplir el propio componente.
- Las animaciones van en el contenedor de afuera (`transform`, `opacity`), no en las medidas del vidrio.
- Nada de vidrio en tablas, formularios largos ni gráficos.
- **Backdrop root:** un contenedor con `backdrop-filter`, `filter`, `opacity < 1` o `mask` (incluida una animación de opacidad que se queda aplicada con `fill-mode: both`) corta lo que el vidrio puede ver. Con eso el vidrio solo muestra ese contenedor y parece transparente. Por eso el panel de la campana va en un portal y las animaciones de entrada usan `backwards`.

---

## Historial

### 1.5.1 — 2026-11-08

- **`frost`:** la escarcha del modo `liquid` va dentro del filtro SVG. Comprobado en Chromium: un `blur()` junto a `url()` en `backdrop-filter` se ignora y el texto de atrás se veía nítido.
- **`sheen`:** brillo especular de borde y reflejo superior. En `lite` también sube el desenfoque y la saturación.
- **Respaldo de `requestAnimationFrame`** con un temporizador de 120 ms: en pestañas ocultas el navegador pausa los frames y el vidrio no se aplicaba.
- Notificaciones y campana dejan de usar StockMindGlass (superficie sin `backdrop-filter`, ≈0 GPU); el vidrio queda solo en el asistente (`maxLiquid: 1`).
- El punto rojo del asistente late 3 veces en lugar de infinitamente.

### 1.5.0 — 2026-11-08

**Correcciones**
- El mapa de refracción se regeneraba en cada clic, cambio de tamaño de la ventana o de atributo. Ahora se **cachea por geometría** (LRU, 64 entradas) y se comparte entre elementos.
- `auto-size`:
  - Los `MutationObserver` y `ResizeObserver` nunca se desconectaban (fuga de memoria) y se duplicaban al reconectar el elemento.
  - El tamaño quedaba congelado tras la primera medida, porque se fijaba en el mismo nodo que se medía.
  - Un elemento oculto entraba en un **bucle infinito de `requestAnimationFrame`**.
- `responsive` sin `base-width`: cada resize volvía a escalar el tamaño ya escalado y el elemento se encogía sin límite.
- El valor `0` era imposible: `blur="0"` se convertía en 2, `depth="0"` en 10 y `strength="0"` en 100.
- `background-color` se observaba pero nunca se aplicaba.
- Chrome en iOS (que usa WebKit) se detectaba como compatible con la refracción.
- Cambiar `auto-size`, `min-*`, `responsive` o `base-*` después de montar no tenía efecto.
- El shadow DOM se reconstruía en cada reconexión.
- Radio o profundidad grandes en un elemento pequeño generaban un SVG con medidas negativas.
- `console.log` en producción.
- El contenido se forzaba a blanco, `sans-serif` y centrado; ahora hereda del contenedor.

**Mejoras**
- Modos `liquid`, `lite` y `solid` con la razón visible, y tope de instancias `liquid`.
- `lite` con aspecto de vidrio de verdad en Firefox y Safari. Antes solo desenfocaba, sin borde ni brillo.
- Accesibilidad: `prefers-reduced-transparency`, `forced-colors` y `prefers-reduced-motion`.
- Eventos pointer (táctil incluido). El efecto de presión ahora es opcional (`interactive`).
- Una actualización por frame como máximo, sin reescribir estilos idénticos.
- Errores capturados con caída a `lite` y evento `glass-error`.
- Trazabilidad: atributos `data-glass-*`, eventos, `stats()` y registro detallado opcional.
- SVG minificado (menos bytes por elemento).
- 21 pruebas automáticas nuevas.

**Compatibilidad:** `getDisplacementMap` y `getDisplacementFilter` conservan su firma. El único cambio de uso es que el efecto al presionar ahora requiere `interactive` (ya agregado en `AgentBubble.jsx`).

### 1.0.x
Primera versión: refracción con `feDisplacementMap` (v1.0.2) y capa suave de vidrio (v1.0.3) en el botón del asistente.
