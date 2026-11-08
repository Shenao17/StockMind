/**
 * ============================================================
 * StockMindGlass — Web Component <glass-element>
 * Archivo: frontend/src/GlassUi/GlassElement.js
 * Versión: v1.5.0
 * ============================================================
 *
 * Vidrio de StockMind en tres niveles, elegidos automáticamente:
 *
 *   liquid → refracción real (feDisplacementMap dentro de backdrop-filter).
 *            Solo Chromium de escritorio/Android y con un tope de instancias
 *            simultáneas (por defecto 3), porque es el modo más costoso.
 *   lite   → vidrio esmerilado solo con CSS (blur + saturate + brillo).
 *            Firefox, Safari, iOS y las instancias que superan el tope.
 *   solid  → superficie opaca. Con "reducir transparencia" o alto contraste.
 *
 * Atributos:
 *   width, height          Tamaño fijo en px (por defecto 200 × 200)
 *   auto-size              El tamaño lo da el contenido (se mide con ResizeObserver)
 *   min-width, min-height  Mínimos con auto-size
 *   radius                 Radio de esquinas (px)
 *   depth                  Profundidad de la refracción (px)
 *   strength               Fuerza del desplazamiento
 *   chromatic-aberration   Separación de canales RGB
 *   blur                   Desenfoque base (liquid usa la mitad, lite el doble)
 *   background-color       Tinte de la superficie
 *   mode                   auto | liquid | lite | solid  (por defecto auto)
 *   interactive            Activa el efecto al presionar (más profundidad + escala)
 *   responsive             Escala width/height según el ancho de la ventana
 *   base-width, base-height Tamaño base para responsive
 *   debug                  Muestra el mapa de desplazamiento en lugar del vidrio
 *
 * Reflejados en el host (para CSS y trazabilidad):
 *   data-glass-mode="liquid|lite|solid|debug"   data-glass-reason="…"
 *   data-glass-state="ready|hidden|error"       data-glass-version="1.5.0"
 *
 * Eventos (burbujean y cruzan el shadow DOM):
 *   glass-ready       primera vez que se aplica el efecto
 *   glass-modechange  { mode, previous, reason }
 *   glass-error       { message }  (cae a lite automáticamente)
 *
 * API estática:
 *   GlassElement.version
 *   GlassElement.configure({ maxLiquid, debug })
 *   GlassElement.stats()        → instancias, modos, caché, contadores
 *   GlassElement.supportsLiquid()
 *   GlassElement.clearCache()
 * Depuración en consola: localStorage.setItem("stockmind:glass:debug", "1")
 *   o window.__STOCKMIND_GLASS__.stats()
 *
 * ── Cambios v1.5.0 (desde v1.0.x) ────────────────────────────
 * Correcciones
 *  - El mapa de refracción se regeneraba en cada clic, resize o cambio: ahora
 *    se cachea por geometría y se comparte (displacement.js).
 *  - auto-size: los observadores nunca se desconectaban (fuga de memoria) y se
 *    duplicaban al reconectar el elemento.
 *  - auto-size: el tamaño quedaba congelado tras la primera medición porque se
 *    fijaba width/height en el mismo nodo que se medía.
 *  - Un elemento oculto (display:none) con auto-size entraba en un bucle infinito
 *    de requestAnimationFrame.
 *  - responsive: sin base-width, cada resize volvía a escalar el tamaño ya escalado
 *    y el elemento se encogía sin límite.
 *  - El valor 0 era imposible (blur="0" daba 2, depth="0" daba 10…).
 *  - background-color se observaba pero nunca se aplicaba.
 *  - Chrome en iOS se detectaba como compatible (usa WebKit) y rompía el efecto.
 *  - Cambiar auto-size, min-width, min-height, responsive o base-* no tenía efecto.
 *  - El shadow DOM se reconstruía en cada reconexión.
 *  - console.log en producción.
 *  - El contenido se forzaba a blanco, sans-serif y centrado; ahora hereda.
 * Mejoras
 *  - Modos liquid/lite/solid con razón visible, y tope de instancias liquid.
 *  - Accesibilidad: prefers-reduced-transparency, forced-colors, prefers-reduced-motion.
 *  - Eventos pointer (táctil incluido) y efecto de presión solo con `interactive`.
 *  - Actualizaciones agrupadas por frame y sin reescribir estilos idénticos.
 *  - Errores capturados: el elemento cae a lite en lugar de quedar roto.
 */

import {
    getGlassFilter,
    getCacheStats,
    clearGlassCache
} from "./displacement.js";


const VERSION = "1.5.0";
const TAG = "glass-element";
const DEBUG_KEY = "stockmind:glass:debug";
const LOG_PREFIX = `[StockMindGlass v${VERSION}]`;

const DEFAULTS = {
    width: 200,
    height: 200,
    radius: 50,
    depth: 10,
    blur: 2,
    strength: 100,
    chromaticAberration: 0,
    backgroundColor: "rgba(255, 255, 255, 0.025)"
};

/** Factor de profundidad al presionar (igual que v1.0.x). */
const PRESSED_DEPTH_FACTOR = 1 / 0.7;

const MODES = ["auto", "liquid", "lite", "solid"];

const config = {
    maxLiquid: 3,
    debug: readDebugFlag()
};

/** Instancias conectadas, en orden de conexión (define quién recibe liquid). */
const registry = new Set();

const counters = {
    created: 0,
    updates: 0,
    skipped: 0,
    modeChanges: 0,
    errors: 0
};

let liquidSupport;
let mediaQueries;


// ───────────────────────────── utilidades ─────────────────────────────

function readDebugFlag() {
    try {
        return typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
        return false;
    }
}

function log(level, ...args) {
    if (!config.debug) return;
    (console[level] || console.log)(LOG_PREFIX, ...args);
}

/** Lee un atributo numérico. A diferencia de v1.0.x, 0 es un valor válido. */
function readNumber(el, name, fallback, min = -Infinity) {
    const raw = el.getAttribute(name);
    if (raw === null || raw.trim() === "") return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * ¿El navegador admite un filtro SVG dentro de backdrop-filter?
 * En la práctica solo Chromium (Chrome, Edge, Opera, Brave) fuera de iOS.
 * En iOS TODOS los navegadores usan WebKit, aunque digan "Chrome" (CriOS).
 */
function detectLiquidSupport() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;

    const css = window.CSS;
    const hasBackdrop = !!css && typeof css.supports === "function" &&
        (css.supports("backdrop-filter", "blur(1px)") ||
         css.supports("-webkit-backdrop-filter", "blur(1px)"));
    if (!hasBackdrop) return false;

    const ua = (navigator.userAgent || "").toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua) ||
        (/macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    if (isIOS) return false;

    const brands = navigator.userAgentData?.brands?.map((b) => b.brand.toLowerCase()) || [];
    const isChromium = brands.some((b) => b.includes("chromium")) ||
        (/chrome|chromium|edg\//.test(ua) && !/firefox|fxios/.test(ua));
    if (!isChromium) return false;

    return css.supports("backdrop-filter", "url(#a)") ||
        css.supports("-webkit-backdrop-filter", "url(#a)");
}

function supportsLiquid() {
    if (liquidSupport === undefined) {
        liquidSupport = detectLiquidSupport();
        log("info", `Refracción (liquid): ${liquidSupport ? "disponible" : "no disponible"}`);
    }
    return liquidSupport;
}

/** Media queries compartidas por todas las instancias (una sola suscripción). */
function preferences() {
    if (mediaQueries !== undefined) return mediaQueries;
    mediaQueries = null;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;

    const make = (q) => {
        try { return window.matchMedia(q); } catch { return null; }
    };
    mediaQueries = {
        reducedTransparency: make("(prefers-reduced-transparency: reduce)"),
        forcedColors: make("(forced-colors: active)")
    };
    const onChange = () => {
        log("info", "Cambió una preferencia del sistema: se recalcula el vidrio");
        refreshAll();
    };
    for (const mq of Object.values(mediaQueries)) {
        if (!mq) continue;
        if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
        else if (typeof mq.addListener === "function") mq.addListener(onChange);
    }
    return mediaQueries;
}

function refreshAll() {
    for (const el of registry) el._schedule();
}


// ───────────────────────────── plantilla ─────────────────────────────

const TEMPLATE_CSS = `
    :host { display: block; position: relative; }
    :host([auto-size]) { display: inline-block; }
    :host([hidden]) { display: none; }

    .glass-box {
        position: relative;
        box-sizing: border-box;
        display: block;
        overflow: hidden;
        isolation: isolate;
        background: transparent;
    }
    :host([auto-size]) .glass-box { display: inline-block; }
    :host([interactive]) .glass-box {
        cursor: pointer;
        transition: transform 0.1s ease;
        -webkit-tap-highlight-color: transparent;
    }
    :host([interactive]) .glass-box:active { transform: scale(0.98); }

    .content {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
    }
    :host([auto-size]) .content { width: auto; height: auto; }
    ::slotted(*) { max-width: 100%; max-height: 100%; }

    @media (prefers-reduced-motion: reduce) {
        :host([interactive]) .glass-box { transition: none; }
        :host([interactive]) .glass-box:active { transform: none; }
    }
`;


// ───────────────────────────── componente ─────────────────────────────

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

class GlassElement extends BaseElement {

    static get version() { return VERSION; }

    static get observedAttributes() {
        return [
            "width", "height", "radius", "depth", "blur", "strength",
            "chromatic-aberration", "background-color", "debug", "mode",
            "auto-size", "min-width", "min-height",
            "responsive", "base-width", "base-height", "interactive"
        ];
    }

    /** Ajusta el comportamiento global. */
    static configure(options = {}) {
        if (Number.isInteger(options.maxLiquid) && options.maxLiquid >= 0) {
            config.maxLiquid = options.maxLiquid;
        }
        if (typeof options.debug === "boolean") config.debug = options.debug;
        refreshAll();
        return { ...config };
    }

    static supportsLiquid() { return supportsLiquid(); }

    static clearCache() { clearGlassCache(); }

    /** Fotografía del estado para depurar o reportar. */
    static stats() {
        const modes = { liquid: 0, lite: 0, solid: 0, debug: 0, pending: 0 };
        for (const el of registry) {
            const m = el._applied?.mode;
            if (m && m in modes) modes[m]++; else modes.pending++;
        }
        return {
            version: VERSION,
            liquidSupported: supportsLiquid(),
            config: { ...config },
            instances: registry.size,
            modes,
            cache: getCacheStats(),
            ...counters
        };
    }

    /** Solo para pruebas: olvida la detección de soporte y preferencias. */
    static _resetEnvironment() {
        liquidSupport = undefined;
        mediaQueries = undefined;
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._rendered = false;
        this._pressed = false;
        this._frame = 0;
        this._applied = null;     // último estilo aplicado
        this._ready = false;
        this._observedSize = null;
        this._settingSize = false;
        counters.created++;
    }


    // ── ciclo de vida ──

    connectedCallback() {
        if (!this._rendered) this._render();

        registry.add(this);
        this.setAttribute("data-glass-version", VERSION);
        preferences();

        this._bindPointer();
        this._syncAutoSize();
        this._syncResponsive();
        this._schedule();
        log("debug", "Conectado", this);
    }

    disconnectedCallback() {
        registry.delete(this);
        this._unbindPointer();
        this._stopAutoSize();
        this._stopResponsive();
        if (this._frame) {
            cancelAnimationFrame(this._frame);
            this._frame = 0;
        }
        // Libera su cupo de liquid para las demás
        refreshAll();
        log("debug", "Desconectado", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue || !this.isConnected) return;

        if (name === "auto-size") this._syncAutoSize();
        if (name === "responsive") this._syncResponsive();
        if ((name === "base-width" || name === "base-height") && this._responsiveHandler) {
            this._updateResponsiveSize();
        }
        // Un cambio externo de tamaño con responsive activo pasa a ser el nuevo tamaño base
        if ((name === "width" || name === "height") && this._responsiveHandler && !this._settingSize &&
            !this.hasAttribute(`base-${name}`)) {
            this._base[name] = readNumber(this, name, DEFAULTS[name], 1);
        }
        if (name === "mode" || name === "debug") refreshAll();

        this._schedule();
    }


    // ── propiedades (React 19 asigna propiedades en custom elements) ──

    get width() { return readNumber(this, "width", DEFAULTS.width, 1); }
    set width(v) { this.setAttribute("width", v); }

    get height() { return readNumber(this, "height", DEFAULTS.height, 1); }
    set height(v) { this.setAttribute("height", v); }

    get radius() { return readNumber(this, "radius", DEFAULTS.radius, 0); }
    set radius(v) { this.setAttribute("radius", v); }

    get baseDepth() { return readNumber(this, "depth", DEFAULTS.depth, 0); }
    set baseDepth(v) { this.setAttribute("depth", v); }

    /** Profundidad efectiva: mayor mientras se presiona. */
    get depth() { return this.baseDepth * (this._pressed ? PRESSED_DEPTH_FACTOR : 1); }
    set depth(v) { this.setAttribute("depth", v); }

    get blur() { return readNumber(this, "blur", DEFAULTS.blur, 0); }
    set blur(v) { this.setAttribute("blur", v); }

    get strength() { return readNumber(this, "strength", DEFAULTS.strength, 0); }
    set strength(v) { this.setAttribute("strength", v); }

    get chromaticAberration() { return readNumber(this, "chromatic-aberration", DEFAULTS.chromaticAberration, 0); }
    set chromaticAberration(v) { this.setAttribute("chromatic-aberration", v); }

    get backgroundColor() { return this.getAttribute("background-color") || DEFAULTS.backgroundColor; }
    set backgroundColor(v) { this.setAttribute("background-color", v); }

    get minWidth() { return readNumber(this, "min-width", 0, 0); }
    set minWidth(v) { this.setAttribute("min-width", v); }

    get minHeight() { return readNumber(this, "min-height", 0, 0); }
    set minHeight(v) { this.setAttribute("min-height", v); }

    get mode() {
        const m = (this.getAttribute("mode") || "auto").toLowerCase();
        return MODES.includes(m) ? m : "auto";
    }
    set mode(v) { this.setAttribute("mode", v); }

    /** Modo realmente aplicado (liquid | lite | solid | debug), o null antes de pintar. */
    get resolvedMode() { return this._applied?.mode ?? null; }

    get debug() { return this.getAttribute("debug") === "true" || this.getAttribute("debug") === ""; }
    set debug(v) { this._toggleAttr("debug", v, "true"); }

    get autoSize() { return this.hasAttribute("auto-size"); }
    set autoSize(v) { this._toggleAttr("auto-size", v); }

    get interactive() { return this.hasAttribute("interactive"); }
    set interactive(v) { this._toggleAttr("interactive", v); }

    get responsive() { return this.hasAttribute("responsive"); }
    set responsive(v) { this._toggleAttr("responsive", v); }

    /** true, "" o "true" activan (React puede pasar cualquiera); false, null, undefined o "false" desactivan. */
    _toggleAttr(name, on, value = "") {
        const enabled = on !== false && on !== null && on !== undefined && on !== "false" && on !== 0;
        if (enabled) this.setAttribute(name, value);
        else this.removeAttribute(name);
    }


    // ── render (una sola vez por instancia) ──

    _render() {
        this.shadowRoot.innerHTML = `
            <style>${TEMPLATE_CSS}</style>
            <div class="glass-box" part="surface"><div class="content" part="content"><slot></slot></div></div>
        `;
        this._box = this.shadowRoot.querySelector(".glass-box");
        this._rendered = true;
    }


    // ── programación de actualizaciones (una por frame) ──

    _schedule() {
        if (this._frame || !this.isConnected) return;
        const raf = typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (fn) => setTimeout(fn, 16);
        this._frame = raf(() => {
            this._frame = 0;
            this._update();
        });
    }

    /** Aplica el efecto de inmediato (útil en pruebas o tras un cambio crítico). */
    refresh() {
        if (this._frame) {
            cancelAnimationFrame(this._frame);
            this._frame = 0;
        }
        this._update();
    }


    // ── núcleo ──

    _size() {
        if (this.autoSize) {
            const s = this._observedSize || {
                // offsetWidth no incluye transformaciones (un hover con scale no regenera el mapa)
                width: this._box.offsetWidth,
                height: this._box.offsetHeight
            };
            return {
                width: Math.max(Math.round(s.width), this.minWidth),
                height: Math.max(Math.round(s.height), this.minHeight)
            };
        }
        return { width: Math.round(this.width), height: Math.round(this.height) };
    }

    _resolveMode() {
        if (this.debug) return { mode: "debug", reason: "debug" };

        const prefs = preferences();
        if (prefs?.forcedColors?.matches) return { mode: "solid", reason: "forced-colors" };
        if (prefs?.reducedTransparency?.matches) return { mode: "solid", reason: "reduced-transparency" };

        const requested = this.mode;
        if (requested === "solid") return { mode: "solid", reason: "requested" };
        if (requested === "lite") return { mode: "lite", reason: "requested" };

        if (!supportsLiquid()) return { mode: "lite", reason: "no-svg-backdrop" };

        // Tope de instancias liquid: las primeras conectadas lo reciben
        let position = 0;
        for (const el of registry) {
            if (el === this) break;
            if (el._wantsLiquid()) position++;
        }
        if (position >= config.maxLiquid) return { mode: "lite", reason: "liquid-budget" };

        return { mode: "liquid", reason: requested === "liquid" ? "requested" : "auto" };
    }

    _wantsLiquid() {
        const m = this.mode;
        return !this.debug && (m === "auto" || m === "liquid");
    }

    _update() {
        if (!this.isConnected || !this._box) return;
        counters.updates++;

        const { width, height } = this._size();
        if (width <= 0 || height <= 0) {
            // Oculto o sin tamaño: no se reintenta en bucle. ResizeObserver o el
            // próximo cambio de atributo lo volverán a pintar.
            this._setState("hidden");
            return;
        }

        const { mode, reason } = this._resolveMode();

        try {
            this._apply(mode, reason, width, height);
        } catch (error) {
            counters.errors++;
            log("error", "No se pudo aplicar el vidrio; se usa lite", error);
            this._setState("error");
            this.dispatchEvent(new CustomEvent("glass-error", {
                bubbles: true,
                composed: true,
                detail: { message: error?.message || String(error) }
            }));
            this._apply("lite", "error", width, height);
        }
    }

    _apply(mode, reason, width, height) {
        const style = this._computeStyle(mode, width, height);
        const signature = JSON.stringify(style);

        if (this._applied && this._applied.signature === signature && this._applied.mode === mode) {
            counters.skipped++;
            this._setState("ready");
            return;
        }

        const box = this._box;
        if (!this.autoSize) {
            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
        } else {
            box.style.width = "";
            box.style.height = "";
            box.style.minWidth = this.minWidth ? `${this.minWidth}px` : "";
            box.style.minHeight = this.minHeight ? `${this.minHeight}px` : "";
        }
        box.style.borderRadius = `${this.radius}px`;
        box.style.background = style.background;
        box.style.backdropFilter = style.backdropFilter;
        box.style.webkitBackdropFilter = style.backdropFilter;
        box.style.border = style.border;
        box.style.boxShadow = style.boxShadow;

        const previous = this._applied?.mode ?? null;
        this._applied = { mode, reason, signature, width, height };

        this.setAttribute("data-glass-mode", mode);
        this.setAttribute("data-glass-reason", reason);
        this._setState("ready");

        if (previous !== mode) {
            if (previous !== null) counters.modeChanges++;
            log("info", `Modo ${previous ?? "—"} → ${mode} (${reason})`, this);
            this.dispatchEvent(new CustomEvent("glass-modechange", {
                bubbles: true,
                composed: true,
                detail: { mode, previous, reason }
            }));
        }
        if (!this._ready) {
            this._ready = true;
            this.dispatchEvent(new CustomEvent("glass-ready", {
                bubbles: true,
                composed: true,
                detail: { mode, reason }
            }));
        }
    }

    _computeStyle(mode, width, height) {
        const bg = this.backgroundColor;

        if (mode === "debug") {
            const { map } = getGlassFilter({
                width, height, radius: this.radius, depth: this.depth,
                strength: this.strength, chromaticAberration: this.chromaticAberration
            });
            return { background: `url("${map}")`, backdropFilter: "none", border: "none", boxShadow: "none" };
        }

        if (mode === "liquid") {
            const { filter } = getGlassFilter({
                width, height, radius: this.radius, depth: this.depth,
                strength: this.strength, chromaticAberration: this.chromaticAberration
            });
            // Desenfoque bajo a propósito: más blur apaga la refracción (blur=3 → 1.5px, como v1.0.3)
            return {
                background: bg,
                backdropFilter: `blur(${round2(this.blur * 0.5)}px) url('${filter}')`,
                border: "1px solid rgba(255, 255, 255, 0.055)",
                boxShadow: "inset 0 0 3px rgba(255, 255, 255, 0.12)"
            };
        }

        if (mode === "lite") {
            const pressed = this._pressed ? 0.04 : 0;
            return {
                background: `linear-gradient(180deg, rgba(255, 255, 255, ${round2(0.09 + pressed)}), rgba(255, 255, 255, 0.025)), ${bg}`,
                backdropFilter: `blur(${round2(Math.max(this.blur * 2, 6))}px) saturate(160%)`,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18)"
            };
        }

        // solid
        const forced = preferences()?.forcedColors?.matches;
        return {
            background: forced ? "Canvas" : "var(--glass-solid-bg, rgba(20, 26, 44, 0.96))",
            backdropFilter: "none",
            border: forced ? "1px solid CanvasText" : "1px solid rgba(255, 255, 255, 0.16)",
            boxShadow: "none"
        };
    }

    _setState(state) {
        if (this.getAttribute("data-glass-state") !== state) {
            this.setAttribute("data-glass-state", state);
        }
    }


    // ── presión (pointer: mouse, táctil y lápiz) ──

    _bindPointer() {
        if (this._onPointerDown) return;
        this._onPointerDown = (event) => {
            if (!this.interactive || event.button > 0) return;
            this._pressed = true;
            this._schedule();
            window.addEventListener("pointerup", this._onPointerUp, { once: true });
            window.addEventListener("pointercancel", this._onPointerUp, { once: true });
        };
        this._onPointerUp = () => {
            window.removeEventListener("pointerup", this._onPointerUp);
            window.removeEventListener("pointercancel", this._onPointerUp);
            if (!this._pressed) return;
            this._pressed = false;
            this._schedule();
        };
        this._box.addEventListener("pointerdown", this._onPointerDown);
        this._box.addEventListener("pointerleave", this._onPointerUp);
    }

    _unbindPointer() {
        if (!this._onPointerDown) return;
        this._box.removeEventListener("pointerdown", this._onPointerDown);
        this._box.removeEventListener("pointerleave", this._onPointerUp);
        window.removeEventListener("pointerup", this._onPointerUp);
        window.removeEventListener("pointercancel", this._onPointerUp);
        this._onPointerDown = null;
        this._onPointerUp = null;
        this._pressed = false;
    }


    // ── auto-size ──

    _syncAutoSize() {
        if (this.autoSize && this.isConnected) this._startAutoSize();
        else this._stopAutoSize();
    }

    _startAutoSize() {
        if (this._resizeObserver || typeof ResizeObserver === "undefined") return;
        this._resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[entries.length - 1];
            const border = entry.borderBoxSize?.[0];
            const next = border
                ? { width: border.inlineSize, height: border.blockSize }
                : { width: this._box.offsetWidth, height: this._box.offsetHeight };
            const prev = this._observedSize;
            if (prev && Math.round(prev.width) === Math.round(next.width) &&
                Math.round(prev.height) === Math.round(next.height)) return;
            this._observedSize = next;
            this._schedule();
        });
        this._resizeObserver.observe(this._box);
    }

    _stopAutoSize() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._observedSize = null;
    }


    // ── responsive ──

    _syncResponsive() {
        if (this.responsive && this.isConnected) this._startResponsive();
        else this._stopResponsive();
    }

    _startResponsive() {
        if (this._responsiveHandler) return;
        // El tamaño base se toma UNA vez: v1.0.x volvía a escalar lo ya escalado
        this._base = {
            width: readNumber(this, "base-width", readNumber(this, "width", DEFAULTS.width, 1), 1),
            height: readNumber(this, "base-height", readNumber(this, "height", DEFAULTS.height, 1), 1)
        };
        let pending = 0;
        this._responsiveHandler = () => {
            if (pending) return;
            pending = requestAnimationFrame(() => {
                pending = 0;
                this._updateResponsiveSize();
            });
        };
        window.addEventListener("resize", this._responsiveHandler, { passive: true });
        this._updateResponsiveSize();
    }

    _stopResponsive() {
        if (!this._responsiveHandler) return;
        window.removeEventListener("resize", this._responsiveHandler);
        this._responsiveHandler = null;
    }

    _updateResponsiveSize() {
        if (!this._base) return;
        if (this.hasAttribute("base-width")) this._base.width = readNumber(this, "base-width", this._base.width, 1);
        if (this.hasAttribute("base-height")) this._base.height = readNumber(this, "base-height", this._base.height, 1);

        const vw = window.innerWidth;
        const scale = vw < 480 ? 0.6 : vw < 768 ? 0.8 : vw < 1024 ? 0.9 : 1;
        const w = Math.round(this._base.width * scale);
        const h = Math.round(this._base.height * scale);

        if (w !== this.width || h !== this.height) {
            this._settingSize = true;
            try {
                this.setAttribute("width", w);
                this.setAttribute("height", h);
            } finally {
                this._settingSize = false;
            }
        }
    }
}


// ───────────────────────────── registro ─────────────────────────────

if (typeof window !== "undefined" && window.customElements && !window.customElements.get(TAG)) {
    window.customElements.define(TAG, GlassElement);
}

if (typeof window !== "undefined") {
    // Trazabilidad desde la consola del navegador (solo lectura y configuración)
    window.__STOCKMIND_GLASS__ = Object.freeze({
        version: VERSION,
        stats: () => GlassElement.stats(),
        configure: (options) => GlassElement.configure(options)
    });
}

export default GlassElement;
export { GlassElement, VERSION as GLASS_VERSION };
