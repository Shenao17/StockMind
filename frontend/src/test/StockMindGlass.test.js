import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGlassFilter,
  getDisplacementMap,
  getDisplacementFilter,
  normalizeGeometry,
  getCacheStats,
  clearGlassCache,
  CACHE_LIMIT,
} from '../GlassUi/displacement.js';
import GlassElement from '../GlassUi/GlassElement.js';

const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';

/** Simula un navegador con (o sin) soporte de filtros SVG en backdrop-filter. */
function fakeBrowser({ ua = CHROME_UA, svgBackdrop = true } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.stubGlobal('CSS', {
    supports: (prop, value) =>
      prop.includes('backdrop-filter') && (value.startsWith('blur') || (svgBackdrop && value.startsWith('url'))),
  });
  GlassElement._resetEnvironment();
}

function mount(attrs = {}) {
  const el = document.createElement('glass-element');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  el.refresh();
  return el;
}

beforeEach(() => {
  clearGlassCache();
  GlassElement._resetEnvironment();
  GlassElement.configure({ maxLiquid: 3, debug: false });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  GlassElement._resetEnvironment();
});

// ─────────────────────────── displacement.js ───────────────────────────

describe('StockMindGlass · mapa de desplazamiento', () => {
  const geo = { width: 52, height: 52, radius: 16, depth: 8, strength: 28, chromaticAberration: 0 };

  it('cachea por geometría: la segunda llamada no regenera el SVG', () => {
    const a = getGlassFilter(geo);
    const b = getGlassFilter(geo);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(b.filter).toBe(a.filter);
    expect(getCacheStats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });

  it('mantiene las funciones de v1.0.x con la misma salida que la caché', () => {
    const map = getDisplacementMap(geo);
    const filter = getDisplacementFilter(geo);
    expect(map.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(filter.endsWith('#displace')).toBe(true);
    expect(getGlassFilter(geo).filter).toBe(filter);
  });

  it('limita radio y profundidad para que el SVG nunca tenga medidas negativas', () => {
    const g = normalizeGeometry({ width: 20, height: 10, radius: 99, depth: 40 });
    expect(g.radius).toBe(5);
    expect(g.depth).toBe(4);
    const svg = decodeURIComponent(getDisplacementMap({ width: 20, height: 10, radius: 99, depth: 40 }));
    expect(svg).not.toMatch(/(width|height)="-/);
  });

  it('acepta valores inválidos sin romperse', () => {
    const g = normalizeGeometry({ width: -5, height: NaN, radius: 'x', depth: undefined });
    expect(g).toMatchObject({ width: 1, height: 1, radius: 0, depth: 0, strength: 100 });
  });

  it('la caché es LRU y respeta su tamaño máximo', () => {
    for (let i = 0; i < CACHE_LIMIT + 5; i++) getGlassFilter({ ...geo, width: 10 + i });
    const s = getCacheStats();
    expect(s.size).toBe(CACHE_LIMIT);
    expect(s.evictions).toBe(5);
  });
});

// ─────────────────────────── <glass-element> ───────────────────────────

describe('StockMindGlass · <glass-element>', () => {
  it('se registra y expone su versión', () => {
    const el = mount({ width: 52, height: 52 });
    expect(customElements.get('glass-element')).toBe(GlassElement);
    expect(GlassElement.version).toBe('1.5.0');
    expect(el.getAttribute('data-glass-version')).toBe('1.5.0');
    expect(window.__STOCKMIND_GLASS__.version).toBe('1.5.0');
  });

  it('sin soporte de filtros SVG usa lite e informa la razón', () => {
    fakeBrowser({ svgBackdrop: false });
    const el = mount({ width: 52, height: 52 });
    expect(el.resolvedMode).toBe('lite');
    expect(el.getAttribute('data-glass-reason')).toBe('no-svg-backdrop');
    expect(el.getAttribute('data-glass-state')).toBe('ready');
  });

  it('en Chromium usa liquid con el filtro de refracción', () => {
    fakeBrowser();
    const el = mount({ width: 52, height: 52, radius: 16, depth: 8, strength: 28, blur: 3 });
    expect(el.resolvedMode).toBe('liquid');
    expect(el._applied.signature).toContain('blur(1.5px)');
    expect(el._applied.signature).toContain('#displace');
  });

  it('Chrome en iOS no se considera compatible (usa WebKit)', () => {
    fakeBrowser({ ua: IOS_CHROME_UA });
    const el = mount({ width: 52, height: 52 });
    expect(el.resolvedMode).toBe('lite');
  });

  it('respeta el tope de instancias liquid y libera el cupo al desmontar', () => {
    fakeBrowser();
    const els = [1, 2, 3, 4].map(() => mount({ width: 40, height: 40 }));
    els.forEach((e) => e.refresh());
    expect(els.map((e) => e.resolvedMode)).toEqual(['liquid', 'liquid', 'liquid', 'lite']);
    expect(els[3].getAttribute('data-glass-reason')).toBe('liquid-budget');

    els[0].remove();
    els[3].refresh();
    expect(els[3].resolvedMode).toBe('liquid');
  });

  it('el valor 0 es válido (v1.0.x lo cambiaba por el valor por defecto)', () => {
    const el = mount({ blur: '0', depth: '0', strength: '0' });
    expect(el.blur).toBe(0);
    expect(el.baseDepth).toBe(0);
    expect(el.strength).toBe(0);
  });

  it('aplica background-color (v1.0.x lo ignoraba)', () => {
    const el = mount({ width: 52, height: 52, 'background-color': 'rgba(1, 2, 3, 0.4)' });
    expect(el._applied.signature).toContain('rgba(1, 2, 3, 0.4)');
  });

  it('con preferencia de reducir transparencia usa solid', () => {
    vi.stubGlobal('matchMedia', (q) => ({
      matches: q.includes('reduced-transparency'),
      addEventListener: vi.fn(),
    }));
    GlassElement._resetEnvironment();
    const el = mount({ width: 52, height: 52 });
    expect(el.resolvedMode).toBe('solid');
    expect(el.getAttribute('data-glass-reason')).toBe('reduced-transparency');
  });

  it('emite glass-ready y glass-modechange', () => {
    const ready = vi.fn();
    const change = vi.fn();
    document.addEventListener('glass-ready', ready);
    document.addEventListener('glass-modechange', change);

    const el = mount({ width: 52, height: 52 });
    expect(ready).toHaveBeenCalledTimes(1);

    el.setAttribute('mode', 'solid');
    el.refresh();
    expect(el.resolvedMode).toBe('solid');
    expect(change.mock.calls.at(-1)[0].detail).toMatchObject({ mode: 'solid', previous: 'lite', reason: 'requested' });

    document.removeEventListener('glass-ready', ready);
    document.removeEventListener('glass-modechange', change);
  });

  it('no reescribe estilos si nada cambió', () => {
    const el = mount({ width: 52, height: 52 });
    const before = GlassElement.stats().skipped;
    el.refresh();
    el.refresh();
    expect(GlassElement.stats().skipped).toBe(before + 2);
  });

  it('auto-size oculto no entra en bucle de requestAnimationFrame', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const el = mount({ 'auto-size': '' });  // en jsdom mide 0 × 0
    const calls = raf.mock.calls.length;
    el.refresh();
    el.refresh();
    expect(el.getAttribute('data-glass-state')).toBe('hidden');
    expect(raf.mock.calls.length).toBe(calls);
  });

  it('auto-size desconecta su ResizeObserver al desmontar y no lo duplica al reconectar', () => {
    const instances = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); this.observe = vi.fn(); instances.push(this); }
    });
    const el = mount({ 'auto-size': '' });
    expect(instances).toHaveLength(1);

    el.remove();
    expect(instances[0].disconnect).toHaveBeenCalled();

    document.body.appendChild(el);
    expect(instances).toHaveLength(2);
    expect(el.shadowRoot.querySelectorAll('.glass-box')).toHaveLength(1);
  });

  it('auto-size usa la medida del ResizeObserver', () => {
    let observer;
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); this.observe = vi.fn(); observer = this; }
    });
    const el = mount({ 'auto-size': '', 'min-height': '40' });
    observer.cb([{ borderBoxSize: [{ inlineSize: 300, blockSize: 24 }] }]);
    el.refresh();
    expect(el._applied).toMatchObject({ width: 300, height: 40 });
  });

  it('responsive no encoge el elemento en cada resize', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(700);   // escala 0.8
    const el = mount({ width: 52, height: 52, responsive: '' });
    el._updateResponsiveSize();
    el._updateResponsiveSize();
    el._updateResponsiveSize();
    expect(el.width).toBe(42);
    expect(el.height).toBe(42);
  });

  it('acepta interactive como booleano o cadena vacía (React 19)', () => {
    const el = mount({ width: 52, height: 52 });
    el.interactive = true;
    expect(el.hasAttribute('interactive')).toBe(true);
    el.interactive = false;
    expect(el.hasAttribute('interactive')).toBe(false);
    el.interactive = '';
    expect(el.hasAttribute('interactive')).toBe(true);
  });

  it('stats() resume instancias, modos y caché', () => {
    fakeBrowser();
    mount({ width: 52, height: 52 });
    mount({ width: 52, height: 52, mode: 'lite' });
    const s = GlassElement.stats();
    expect(s.instances).toBe(2);
    expect(s.modes).toMatchObject({ liquid: 1, lite: 1 });
    expect(s.cache.size).toBeGreaterThan(0);
  });
});
