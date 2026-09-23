/**
 * ============================================================
 * StockMind — Liquid Glass UI
 * Archivo: frontend/src/GlassUi/GlassElement.js
 * Versión: v1.0.3 — Soft Glass Layer
 * ============================================================
 *
 * Web Component GlassElement
 *
 * Liquid Glass mediante:
 * - SVG displacement map
 * - feDisplacementMap
 * - backdrop-filter
 * - blur suave
 * - micro capa de cristal
 *
 * Adaptado para Vite / React.
 *
 * v1.0.3:
 * - Mantiene intacta la refracción de v1.0.2.
 * - Reintroduce blur de forma controlada.
 * - Añade una micro capa transparente de cristal.
 * - Añade un glow interno extremadamente sutil.
 * - Sin tint blanco fuerte.
 * - Sin brightness/saturate adicional.
 * - Se mantienen intactos:
 *   - SVG displacement map.
 *   - feDisplacementMap.
 *   - depth.
 *   - strength.
 *   - chromatic aberration.
 */

import {
    getDisplacementFilter,
    getDisplacementMap
} from "./displacement.js";


class GlassElement extends HTMLElement {

    constructor() {
        super();

        this.clicked = false;

        this.attachShadow({
            mode: "open"
        });

        if (GlassElement._svgFilterSupport === undefined) {

            GlassElement._svgFilterSupport =
                this.detectSVGFilterSupport();

            console.log(
                `[GlassElement] SVG Filter Support: ${
                    GlassElement._svgFilterSupport
                        ? "✅ YES"
                        : "❌ NO"
                }`
            );
        }
    }


    /**
     * Detecta soporte para SVG filters
     * utilizados dentro de backdrop-filter.
     */
    detectSVGFilterSupport() {

        const testElement =
            document.createElement("div");

        testElement.style.backdropFilter =
            "blur(1px)";

        if (!testElement.style.backdropFilter) {
            return false;
        }

        const userAgent =
            navigator.userAgent.toLowerCase();

        const isChrome =
            /chrome|chromium|crios|edg/.test(
                userAgent
            ) &&
            !/firefox|fxios/.test(
                userAgent
            );

        const isFirefox =
            /firefox|fxios/.test(
                userAgent
            );

        const isSafari =
            /safari/.test(userAgent) &&
            !/chrome|chromium|crios|edg/.test(
                userAgent
            );

        /*
         * Chromium es nuestro navegador objetivo
         * para esta implementación.
         */
        if (isChrome) {
            return true;
        }

        /*
         * Firefox y Safari no se consideran
         * compatibles con este tipo de SVG
         * dentro de backdrop-filter.
         */
        if (isFirefox || isSafari) {
            return false;
        }

        try {

            testElement.style.backdropFilter =
                "url(#test)";

            return testElement.style.backdropFilter
                .includes("url");

        } catch {
            return false;
        }
    }


    get hasSVGFilterSupport() {

        return GlassElement._svgFilterSupport;
    }


    /**
     * Atributos observados.
     */
    static get observedAttributes() {

        return [
            "width",
            "height",
            "radius",
            "depth",
            "blur",
            "strength",
            "chromatic-aberration",
            "debug",
            "background-color",
            "responsive",
            "base-width",
            "base-height",
            "auto-size",
            "min-width",
            "min-height"
        ];
    }


    connectedCallback() {

        this.render();

        this.setupEventListeners();

        this.setupResponsive();

        if (this.autoSize) {
            this.setupAutoSizeObserver();
        }
    }


    /**
     * Recalcular el efecto cuando cambian
     * atributos desde React.
     */
    attributeChangedCallback(
        name,
        oldValue,
        newValue
    ) {

        if (
            oldValue === newValue ||
            !this.isConnected
        ) {
            return;
        }

        if (
            name === "width" ||
            name === "height" ||
            name === "radius" ||
            name === "depth" ||
            name === "blur" ||
            name === "strength" ||
            name === "chromatic-aberration" ||
            name === "background-color" ||
            name === "debug"
        ) {

            requestAnimationFrame(() => {
                this.updateStyles();
            });
        }
    }


    /**
     * Auto-size.
     */
    setupAutoSizeObserver() {

        const observer =
            new MutationObserver(() => {

                requestAnimationFrame(() => {
                    this.updateStyles();
                });

            });

        observer.observe(this, {
            childList: true,
            subtree: true,
            characterData: true
        });


        if (window.ResizeObserver) {

            const resizeObserver =
                new ResizeObserver(() => {

                    this.updateStyles();

                });

            const glassBox =
                this.shadowRoot.querySelector(
                    ".glass-box"
                );

            if (glassBox) {
                resizeObserver.observe(glassBox);
            }
        }
    }


    /**
     * Responsive.
     */
    setupResponsive() {

        if (!this.hasAttribute("responsive")) {
            return;
        }

        this.updateResponsiveSize();

        this._resizeHandler =
            () => this.updateResponsiveSize();

        window.addEventListener(
            "resize",
            this._resizeHandler
        );
    }


    disconnectedCallback() {

        if (this._resizeHandler) {

            window.removeEventListener(
                "resize",
                this._resizeHandler
            );
        }

        if (this._documentMouseUpHandler) {

            document.removeEventListener(
                "mouseup",
                this._documentMouseUpHandler
            );
        }
    }


    updateResponsiveSize() {

        const baseWidth =
            parseInt(
                this.getAttribute("base-width") ||
                this.getAttribute("width")
            ) || 200;

        const baseHeight =
            parseInt(
                this.getAttribute("base-height") ||
                this.getAttribute("height")
            ) || 200;


        const viewport =
            window.innerWidth;

        let scale = 1;


        if (viewport < 480) {
            scale = 0.6;
        } else if (viewport < 768) {
            scale = 0.8;
        } else if (viewport < 1024) {
            scale = 0.9;
        }


        const newWidth =
            Math.round(baseWidth * scale);

        const newHeight =
            Math.round(baseHeight * scale);


        if (
            newWidth !== this.width ||
            newHeight !== this.height
        ) {

            this.setAttribute(
                "width",
                newWidth
            );

            this.setAttribute(
                "height",
                newHeight
            );
        }
    }


    /*
     * React puede tratar atributos de un
     * Web Component como propiedades.
     *
     * Los setters evitan errores del tipo:
     *
     * Cannot set property width...
     */


    get width() {

        return (
            parseInt(
                this.getAttribute("width")
            ) || 200
        );
    }

    set width(value) {

        this.setAttribute(
            "width",
            value
        );
    }


    get height() {

        return (
            parseInt(
                this.getAttribute("height")
            ) || 200
        );
    }

    set height(value) {

        this.setAttribute(
            "height",
            value
        );
    }


    get radius() {

        return (
            parseInt(
                this.getAttribute("radius")
            ) || 50
        );
    }

    set radius(value) {

        this.setAttribute(
            "radius",
            value
        );
    }


    get baseDepth() {

        return (
            parseInt(
                this.getAttribute("depth")
            ) || 10
        );
    }

    set baseDepth(value) {

        this.setAttribute(
            "depth",
            value
        );
    }


    get blur() {

        return (
            parseInt(
                this.getAttribute("blur")
            ) || 2
        );
    }

    set blur(value) {

        this.setAttribute(
            "blur",
            value
        );
    }


    get strength() {

        return (
            parseInt(
                this.getAttribute("strength")
            ) || 100
        );
    }

    set strength(value) {

        this.setAttribute(
            "strength",
            value
        );
    }


    get chromaticAberration() {

        return (
            parseInt(
                this.getAttribute(
                    "chromatic-aberration"
                )
            ) || 0
        );
    }

    set chromaticAberration(value) {

        this.setAttribute(
            "chromatic-aberration",
            value
        );
    }


    get debug() {

        return (
            this.getAttribute("debug") === "true"
        );
    }

    set debug(value) {

        if (value) {

            this.setAttribute(
                "debug",
                "true"
            );

        } else {

            this.removeAttribute(
                "debug"
            );
        }
    }


    get backgroundColor() {

        return (
            this.getAttribute(
                "background-color"
            ) ||
            "transparent"
        );
    }

    set backgroundColor(value) {

        this.setAttribute(
            "background-color",
            value
        );
    }


    get autoSize() {

        return this.hasAttribute(
            "auto-size"
        );
    }

    set autoSize(value) {

        if (value) {

            this.setAttribute(
                "auto-size",
                ""
            );

        } else {

            this.removeAttribute(
                "auto-size"
            );
        }
    }


    get minWidth() {

        return (
            parseInt(
                this.getAttribute("min-width")
            ) || 0
        );
    }

    set minWidth(value) {

        this.setAttribute(
            "min-width",
            value
        );
    }


    get minHeight() {

        return (
            parseInt(
                this.getAttribute("min-height")
            ) || 0
        );
    }

    set minHeight(value) {

        this.setAttribute(
            "min-height",
            value
        );
    }


    /**
     * Profundidad efectiva.
     *
     * Al presionar el elemento aumenta la
     * profundidad de la refracción.
     */
    get depth() {

        return (
            this.baseDepth /
            (this.clicked ? 0.7 : 1)
        );
    }

    set depth(value) {

        this.setAttribute(
            "depth",
            value
        );
    }


    /**
     * Eventos de interacción.
     */
    setupEventListeners() {

        const glassBox =
            this.shadowRoot.querySelector(
                ".glass-box"
            );

        if (!glassBox) {
            return;
        }


        this._mouseDownHandler =
            () => {

                this.clicked = true;

                this.updateStyles();
            };


        this._mouseUpHandler =
            () => {

                this.clicked = false;

                this.updateStyles();
            };


        glassBox.addEventListener(
            "mousedown",
            this._mouseDownHandler
        );


        glassBox.addEventListener(
            "mouseup",
            this._mouseUpHandler
        );


        glassBox.addEventListener(
            "mouseleave",
            this._mouseUpHandler
        );


        this._documentMouseUpHandler =
            () => {

                if (this.clicked) {

                    this.clicked = false;

                    this.updateStyles();
                }
            };


        document.addEventListener(
            "mouseup",
            this._documentMouseUpHandler
        );
    }


    updateStyles() {

        const glassBox =
            this.shadowRoot.querySelector(
                ".glass-box"
            );

        if (!glassBox) {
            return;
        }

        this.applyDynamicStyles(
            glassBox
        );
    }


    /**
     * Aplicar el efecto Liquid Glass.
     */
    applyDynamicStyles(element) {

        const width =
            this.autoSize
                ? this.getActualWidth(element)
                : this.width;

        const height =
            this.autoSize
                ? this.getActualHeight(element)
                : this.height;


        if (
            width <= 0 ||
            height <= 0
        ) {

            requestAnimationFrame(() => {
                this.updateStyles();
            });

            return;
        }


        element.style.width =
            `${width}px`;

        element.style.height =
            `${height}px`;

        element.style.borderRadius =
            `${this.radius}px`;


        /*
         * DEBUG
         *
         * Permite visualizar directamente
         * el displacement map.
         */
        if (this.debug) {

            element.style.background =
                `url("${getDisplacementMap({
                    height,
                    width,
                    radius: this.radius,
                    depth: this.depth
                })}")`;

            element.style.backdropFilter =
                "none";

            element.style.webkitBackdropFilter =
                "none";

            element.style.boxShadow =
                "none";

            element.style.border =
                "none";

            return;
        }


        /*
         * FALLBACK
         *
         * Si el navegador no soporta SVG
         * dentro de backdrop-filter, usamos
         * blur normal.
         */
        if (!this.hasSVGFilterSupport) {

            const fallbackBlur =
                `blur(${this.blur * 2}px)`;


            element.style.backdropFilter =
                fallbackBlur;

            element.style.webkitBackdropFilter =
                fallbackBlur;


            element.style.background =
                "transparent";


            element.style.border =
                "none";


            element.style.boxShadow =
                "none";


            return;
        }


        /*
         * LIQUID GLASS REAL
         *
         * v1.0.3 — SOFT GLASS
         *
         * La refracción continúa siendo
         * exactamente la misma.
         *
         * Añadimos únicamente:
         * - blur suave
         * - micro tint transparente
         * - glow interno mínimo
         *
         * No añadimos todavía:
         * - brightness
         * - saturate
         * - shine complejo
         */
        const filter =
            getDisplacementFilter({
                height,
                width,
                radius: this.radius,
                depth: this.depth,
                strength: this.strength,
                chromaticAberration:
                    this.chromaticAberration
            });


        /*
         * El blur se mantiene deliberadamente
         * bajo para no matar la refracción.
         */
        const backdropValue =
            `blur(1.5px) url('${filter}')`;


        element.style.backdropFilter =
            backdropValue;

        element.style.webkitBackdropFilter =
            backdropValue;


        /*
         * Micro capa de cristal.
         *
         * Mucho más transparente que el
         * ejemplo original de Liquid Glass.
         */
        element.style.background =
            "rgba(255, 255, 255, 0.025)";


        /*
         * Refuerzo visual mínimo de los bordes.
         *
         * Todavía no es el shine final.
         */
        element.style.border =
            "1px solid rgba(255, 255, 255, 0.055)";


        element.style.boxShadow =
            "inset 0 0 3px rgba(255, 255, 255, 0.12)";
    }


    /**
     * Obtener dimensiones reales para auto-size.
     */
    getActualWidth(element) {

        element.style.backdropFilter =
            "none";

        element.style.webkitBackdropFilter =
            "none";

        element.style.background =
            "transparent";


        const rect =
            element.getBoundingClientRect();


        return Math.max(
            Math.ceil(rect.width),
            this.minWidth,
            50
        );
    }


    getActualHeight(element) {

        const rect =
            element.getBoundingClientRect();


        return Math.max(
            Math.ceil(rect.height),
            this.minHeight,
            30
        );
    }


    /**
     * Render del Web Component.
     */
    render() {

        this.shadowRoot.innerHTML = `
            <style>

                :host {
                    display: ${
                        this.autoSize
                            ? "inline-block"
                            : "block"
                    };
                }

                .glass-box {

                    position: relative;

                    box-sizing: border-box;

                    display: ${
                        this.autoSize
                            ? "inline-block"
                            : "block"
                    };

                    background:
                        transparent;

                    border:
                        none;

                    box-shadow:
                        none;

                    overflow: hidden;

                    cursor: pointer;

                    transition:
                        transform 0.1s ease;
                }

                .glass-box:active {
                    transform:
                        scale(0.98);
                }

                .content {

                    width: 100%;
                    height: 100%;

                    display: flex;

                    align-items: center;

                    justify-content: center;

                    color: white;

                    text-align: center;

                    font-family:
                        sans-serif;

                    box-sizing:
                        border-box;
                }

                ::slotted(*) {
                    max-width: 100%;
                    max-height: 100%;
                }

            </style>

            <div class="glass-box">

                <div class="content">

                    <slot></slot>

                </div>

            </div>
        `;


        const glassBox =
            this.shadowRoot.querySelector(
                ".glass-box"
            );


        if (!glassBox) {
            return;
        }


        if (this.autoSize) {

            requestAnimationFrame(() => {

                requestAnimationFrame(() => {

                    this.applyDynamicStyles(
                        glassBox
                    );

                });

            });

        } else {

            this.applyDynamicStyles(
                glassBox
            );
        }
    }
}


/**
 * Registro seguro para Vite + HMR.
 */
if (
    !customElements.get(
        "glass-element"
    )
) {

    customElements.define(
        "glass-element",
        GlassElement
    );
}


export default GlassElement;