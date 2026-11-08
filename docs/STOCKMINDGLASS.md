# StockMindGlass — vidrio líquido de la interfaz

**Versión:** 1.5.0 · **Código:** `frontend/src/GlassUi/` (`GlassElement.js`, `displacement.js`) · **Pruebas:** `frontend/src/test/StockMindGlass.test.js`

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
| `blur` | 2 | `liquid` usa la mitad y `lite` el doble (mínimo 6 px) |
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

## Reglas de uso

- `liquid` solo en elementos **pequeños y de tamaño fijo** (botón del asistente, tarjeta del login, selectores). En elementos que cambian de tamaño, `auto-size` regenera el mapa con cada medida nueva (queda en caché, pero cada tamaño distinto es una entrada).
- Como máximo 2 o 3 en `liquid` en pantalla; el tope lo hace cumplir el propio componente.
- Las animaciones van en el contenedor de afuera (`transform`, `opacity`), no en las medidas del vidrio.
- Nada de vidrio en tablas, formularios largos ni gráficos.

---

## Historial

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
