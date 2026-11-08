/**
 * ============================================================
 * StockMindGlass — Mapas de desplazamiento y filtros
 * Archivo: frontend/src/GlassUi/displacement.js
 * Versión: v1.5.0
 * ============================================================
 *
 * Genera el mapa (feImage) y el filtro SVG (feDisplacementMap) que producen
 * la refracción del Liquid Glass.
 *
 * v1.5.0:
 * - Caché LRU por geometría: un mismo tamaño/radio/profundidad/fuerza se
 *   calcula UNA sola vez y se comparte entre todos los elementos.
 * - Geometría saneada: radio y profundidad se limitan al tamaño del elemento
 *   (antes un elemento pequeño generaba rectángulos con ancho negativo).
 * - Valores redondeados: claves de caché estables y SVG más corto.
 * - SVG minificado: menos bytes por data URL.
 * - Estadísticas (aciertos, fallos, tamaño) para trazabilidad.
 */

/** Entradas máximas en caché. Cada una pesa unos pocos KB. */
const CACHE_LIMIT = 64;

const cache = new Map();
const stats = { hits: 0, misses: 0, evictions: 0 };

const round = (n, decimals = 2) => {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
};

const finite = (n, fallback) => (Number.isFinite(n) ? n : fallback);

/**
 * Normaliza la geometría para que el SVG resultante siempre sea válido.
 *  - width/height: enteros ≥ 1
 *  - radius: 0 … min(width, height) / 2
 *  - depth:  0 … min(width, height) / 2 - 1
 *  - strength / chromaticAberration: ≥ 0
 *  - frost: ≥ 0 (desenfoque dentro del filtro; 0 = sin nodo de desenfoque, igual que antes)
 */
function normalizeGeometry({
    width,
    height,
    radius = 0,
    depth = 0,
    strength = 100,
    chromaticAberration = 0,
    frost = 0
}) {
    const w = Math.max(1, Math.round(finite(Number(width), 1)));
    const h = Math.max(1, Math.round(finite(Number(height), 1)));
    const half = Math.min(w, h) / 2;

    return {
        width: w,
        height: h,
        radius: round(Math.min(Math.max(0, finite(Number(radius), 0)), half)),
        depth: round(Math.min(Math.max(0, finite(Number(depth), 0)), Math.max(0, half - 1))),
        strength: round(Math.max(0, finite(Number(strength), 100))),
        chromaticAberration: round(Math.max(0, finite(Number(chromaticAberration), 0))),
        frost: round(Math.max(0, finite(Number(frost), 0)))
    };
}

const cacheKey = (g) =>
    `${g.width}x${g.height}|r${g.radius}|d${g.depth}|s${g.strength}|c${g.chromaticAberration}|f${g.frost}`;

const toDataUrl = (svg) =>
    "data:image/svg+xml;utf8," + encodeURIComponent(svg.replace(/\s{2,}/g, " ").trim());

/** Porcentaje del degradado según el radio, limitado a 0–50 % para no invertirlo. */
const edgePct = (radius, size) => Math.min(50, (radius / size) * 15);

function buildMap(g) {
    const { width: w, height: h, radius: r, depth: d } = g;
    const svg = `
        <svg height="${h}" width="${w}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
            <style>.mix{mix-blend-mode:screen}</style>
            <defs>
                <linearGradient id="Y" x1="0" x2="0" y1="${Math.ceil(edgePct(r, h))}%" y2="${Math.floor(100 - edgePct(r, h))}%">
                    <stop offset="0%" stop-color="#0F0"/><stop offset="100%" stop-color="#000"/>
                </linearGradient>
                <linearGradient id="X" x1="${Math.ceil(edgePct(r, w))}%" x2="${Math.floor(100 - edgePct(r, w))}%" y1="0" y2="0">
                    <stop offset="0%" stop-color="#F00"/><stop offset="100%" stop-color="#000"/>
                </linearGradient>
            </defs>
            <rect x="0" y="0" height="${h}" width="${w}" fill="#808080"/>
            <g filter="blur(2px)">
                <rect x="0" y="0" height="${h}" width="${w}" fill="#000080"/>
                <rect x="0" y="0" height="${h}" width="${w}" fill="url(#Y)" class="mix"/>
                <rect x="0" y="0" height="${h}" width="${w}" fill="url(#X)" class="mix"/>
                <rect x="${d}" y="${d}" height="${Math.max(0, h - 2 * d)}" width="${Math.max(0, w - 2 * d)}" fill="#808080" rx="${r}" ry="${r}" filter="blur(${d}px)"/>
            </g>
        </svg>`;
    return toDataUrl(svg);
}

function buildFilter(g, mapUrl) {
    const { width: w, height: h, strength: s, chromaticAberration: ca, frost: f } = g;
    // Escarcha DENTRO del filtro: Chromium ignora un blur() de backdrop-filter cuando la lista
    // incluye url(), así que el desenfoque tiene que vivir aquí. Se aplica antes de refractar.
    const src = f > 0 ? "frosted" : "SourceGraphic";
    const frostNode = f > 0
        ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${f}" edgeMode="duplicate" result="frosted"/>`
        : "";
    const svg = `
        <svg height="${h}" width="${w}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="displace" color-interpolation-filters="sRGB">
                    ${frostNode}
                    <feImage x="0" y="0" height="${h}" width="${w}" href="${mapUrl}" result="displacementMap"/>
                    <feDisplacementMap transform-origin="center" in="${src}" in2="displacementMap" scale="${round(s + ca * 2)}" xChannelSelector="R" yChannelSelector="G"/>
                    <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedR"/>
                    <feDisplacementMap in="${src}" in2="displacementMap" scale="${round(s + ca)}" xChannelSelector="R" yChannelSelector="G"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="displacedG"/>
                    <feDisplacementMap in="${src}" in2="displacementMap" scale="${s}" xChannelSelector="R" yChannelSelector="G"/>
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="displacedB"/>
                    <feBlend in="displacedR" in2="displacedG" mode="screen"/>
                    <feBlend in2="displacedB" mode="screen"/>
                </filter>
            </defs>
        </svg>`;
    return toDataUrl(svg) + "#displace";
}

/**
 * Mapa y filtro para una geometría, desde la caché si ya existen.
 * @returns {{ key: string, map: string, filter: string, geometry: object, cached: boolean }}
 */
function getGlassFilter(input) {
    const geometry = normalizeGeometry(input);
    const key = cacheKey(geometry);

    const hit = cache.get(key);
    if (hit) {
        stats.hits++;
        // LRU: se mueve al final como la más reciente
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit, cached: true };
    }

    stats.misses++;
    const map = buildMap(geometry);
    const entry = { key, map, filter: buildFilter(geometry, map), geometry };
    cache.set(key, entry);

    if (cache.size > CACHE_LIMIT) {
        cache.delete(cache.keys().next().value);
        stats.evictions++;
    }
    return { ...entry, cached: false };
}

/** Compatibilidad con v1.0.x: misma firma, ahora con caché. */
function getDisplacementMap(input) {
    return getGlassFilter(input).map;
}

/** Compatibilidad con v1.0.x: misma firma, ahora con caché. */
function getDisplacementFilter(input) {
    return getGlassFilter(input).filter;
}

function getCacheStats() {
    return { size: cache.size, limit: CACHE_LIMIT, ...stats };
}

function clearGlassCache() {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
}

export {
    normalizeGeometry,
    getGlassFilter,
    getDisplacementMap,
    getDisplacementFilter,
    getCacheStats,
    clearGlassCache,
    CACHE_LIMIT
};
