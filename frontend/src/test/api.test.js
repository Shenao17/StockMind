import { vi } from 'vitest';
import { API } from '../api';

// Se intercepta fetch para comprobar la URL que arma el cliente
function mockFetch() {
  const fn = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({}), text: async () => '{}',
    headers: { get: () => 'application/json' },
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const urlOf = (fn) => fn.mock.calls[0][0];

describe('API — parámetros de listados', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('products.list sin parámetros no agrega query string', async () => {
    const f = mockFetch();
    await API.products.list();
    expect(urlOf(f)).toMatch(/\/products$/);
  });

  it('products.list arma page, size, search y categoryId, omitiendo los vacíos', async () => {
    const f = mockFetch();
    await API.products.list({ page: 2, size: 10, search: 'mouse', categoryId: '', lowStock: undefined });
    const url = new URL(urlOf(f), 'http://localhost');
    expect(url.pathname).toMatch(/\/products$/);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('size')).toBe('10');
    expect(url.searchParams.get('search')).toBe('mouse');
    expect(url.searchParams.has('categoryId')).toBe(false);
  });

  it('codifica caracteres especiales de la búsqueda', async () => {
    const f = mockFetch();
    await API.products.list({ search: '100% & más' });
    expect(new URL(urlOf(f), 'http://localhost').searchParams.get('search')).toBe('100% & más');
  });

  it('inventory.movements acepta el formato antiguo (productId) y el nuevo (objeto)', async () => {
    let f = mockFetch();
    await API.inventory.movements(7);
    expect(new URL(urlOf(f), 'http://localhost').searchParams.get('productId')).toBe('7');
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.inventory.movements({ page: 1, size: 15, type: 'ENTRY' });
    const url = new URL(urlOf(f), 'http://localhost');
    expect(url.searchParams.get('type')).toBe('ENTRY');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('sales.list acepta (from, to) y también un objeto', async () => {
    let f = mockFetch();
    await API.sales.list('2026-01-01', '2026-01-31');
    expect(new URL(urlOf(f), 'http://localhost').searchParams.get('from')).toBe('2026-01-01');
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.sales.list({ page: 0, size: 15 });
    expect(new URL(urlOf(f), 'http://localhost').searchParams.get('size')).toBe('15');
  });

  it('expone facturación, pagos públicos y panel de plataforma', async () => {
    let f = mockFetch();
    await API.billing.subscription();
    expect(urlOf(f)).toMatch(/\/billing\/subscription$/);
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.billing.checkout({ planCode: 'PRO', billingCycle: 'MONTHLY' });
    expect(urlOf(f)).toMatch(/\/billing\/checkout$/);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ planCode: 'PRO', billingCycle: 'MONTHLY' });
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.public.simulatePayment('ref123');
    expect(urlOf(f)).toMatch(/\/public\/payments\/ref123\/simulate$/);
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.platform.action(7, 'extend-trial', { days: 5 });
    expect(urlOf(f)).toMatch(/\/platform\/organizations\/7\/extend-trial$/);
    vi.unstubAllGlobals();

    f = mockFetch();
    await API.platform.organizations({ page: 1, status: 'PENDING', search: '' });
    const url = new URL(urlOf(f), 'http://localhost');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.has('search')).toBe(false);
  });

  it('los errores del servidor conservan el código (p. ej. PLAN_LIMIT_REACHED)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 402, json: async () => ({ error: 'Límite de plan', code: 'PLAN_LIMIT_REACHED' }),
      headers: { get: () => 'application/json' },
    }));
    await expect(API.users.create({})).rejects.toMatchObject({ message: 'Límite de plan', code: 'PLAN_LIMIT_REACHED', status: 402 });
  });

  it('expone categorías y resumen del dashboard', async () => {
    let f = mockFetch();
    await API.categories.list();
    expect(urlOf(f)).toMatch(/\/categories$/);
    vi.unstubAllGlobals();
    f = mockFetch();
    await API.dashboard.summary();
    expect(urlOf(f)).toMatch(/\/dashboard\/summary$/);
  });
});
