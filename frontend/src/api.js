/**
 * StockMind React — Cliente HTTP centralizado
 * El JWT ya NO se guarda en localStorage: vive en una cookie httpOnly que
 * el navegador maneja solo. Cada fetch va con credentials:'include' para
 * que la cookie viaje automáticamente; no hay nada que leer/escribir aquí.
 */

const BASE_URL = 'http://localhost:3000/api';

// ── Auth helpers ──────────────────────────────────────────
let cachedUser = null;

export const Auth = {
  getUser:    () => cachedUser,
  setUser:    (user) => { cachedUser = user; },
  clearUser:  () => { cachedUser = null; },
  isAdmin:    () => cachedUser?.role === 'ADMIN',
  isLoggedIn: () => !!cachedUser,
};

// ── Fetch base ────────────────────────────────────────────
async function apiRequest(method, endpoint, body = null) {
  const headers = { 'Content-Type': 'application/json' };

  const options = {
    method,
    headers,
    credentials: 'include', // manda/recibe la cookie httpOnly del gateway
    ...(body && { body: JSON.stringify(body) }),
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    // IMPORTANTE: un 401 en /auth/me es un estado NORMAL cuando todavía no
    // hay sesión (por ejemplo, al cargar la app por primera vez). Redirigir
    // aquí causaría un bucle infinito: redirige a '/' -> remonta AuthProvider
    // -> vuelve a llamar /me -> vuelve a dar 401 -> vuelve a redirigir...
    //
    // Tampoco redirigimos en /auth/login: un 401 ahí significa que las
    // credenciales son incorrectas y el componente Login debe poder recibir
    // el mensaje y mostrarlo al usuario.
    if (
      response.status === 401 &&
      endpoint !== '/auth/me' &&
      endpoint !== '/auth/login'
    ) {
      Auth.clearUser();
      window.location.href = '/';
      return null;
    }

    const contentType = response.headers.get('content-type');
    const data = contentType?.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const errorMsg = data?.error || data || `Error HTTP ${response.status}`;
      // `code` y `status` permiten distinguir p. ej. PLAN_LIMIT_REACHED o SUBSCRIPTION_READ_ONLY (402)
      throw Object.assign(new Error(errorMsg), { code: data?.code, status: response.status });
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(
        'No se puede conectar con el servidor.'
      );
    }

    throw error;
  }
}

// Construye ?a=1&b=2 omitiendo valores vacíos
const qs = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ── API pública ───────────────────────────────────────────
export const API = {
  auth: {
    login:  (data) => apiRequest('POST', '/auth/login', data),
    logout: ()     => apiRequest('POST', '/auth/logout'),
    me:     ()     => apiRequest('GET',  '/auth/me'),
  },

  users: {
    // params: { page, size, search, role, active, sort, dir } → con page/size devuelve { content, page, size, totalElements, totalPages }
    list:   (params)   => apiRequest('GET',    `/users${qs(params)}`),
    create: (data)     => apiRequest('POST',   '/users', data),
    update: (id, data) => apiRequest('PUT',    `/users/${id}`, data),
    remove: (id)       => apiRequest('DELETE', `/users/${id}`),
  },

  products: {
    // params: { page, size, search, categoryId, lowStock, sort, dir } → con page/size devuelve el sobre paginado; sin params, el arreglo completo
    list:     (params)   => apiRequest('GET',    `/products${qs(params)}`),
    get:      (id)       => apiRequest('GET',    `/products/${id}`),
    lowStock: ()         => apiRequest('GET',    '/products/low-stock'),
    create:   (data)     => apiRequest('POST',   '/products', data),
    update:   (id, data) => apiRequest('PUT',    `/products/${id}`, data),
    remove:   (id)       => apiRequest('DELETE', `/products/${id}`),
  },

  inventory: {
    // movements(productId) o movements({ page, size, productId, type, from, to })
    movements: (arg) =>
      apiRequest(
        'GET',
        `/inventory/movements${
          arg && typeof arg === 'object' ? qs(arg) : qs({ productId: arg })
        }`
      ),
    register: (data) =>
      apiRequest('POST', '/inventory/movements', data),
  },

  sales: {
    // list(from, to) o list({ page, size, from, to, status, userId, sort, dir })
    list:   (arg, to) =>
      apiRequest(
        'GET',
        `/sales${
          arg && typeof arg === 'object' ? qs(arg) : qs({ from: arg, to })
        }`
      ),
    get:    (id) =>
      apiRequest('GET', `/sales/${id}`),
    create: (data) =>
      apiRequest('POST', '/sales', data),
  },

  // Endpoints públicos (sin sesión): verificación del correo y enlaces de pago
  public: {
    verifyEmail:     (token) => apiRequest('POST', '/public/verify-email', { token }),
    plans:           ()      => apiRequest('GET',  '/public/plans'),
    payment:         (ref)   => apiRequest('GET',  `/public/payments/${ref}`),
    simulatePayment: (ref)   => apiRequest('POST', `/public/payments/${ref}/simulate`),
  },

  // Plan y pagos de la empresa
  billing: {
    subscription: ()     => apiRequest('GET',  '/billing/subscription'),
    plans:        ()     => apiRequest('GET',  '/billing/plans'),
    payments:     ()     => apiRequest('GET',  '/billing/payments'),
    checkout:     (data) => apiRequest('POST', '/billing/checkout', data),
  },

  // Panel del dueño de la plataforma (solo PLATFORM_ADMIN)
  platform: {
    organizations: (params)         => apiRequest('GET',  `/platform/organizations${qs(params)}`),
    create:        (data)           => apiRequest('POST', '/platform/organizations', data),
    // action: suspend | reactivate | cancel | extend-trial | plan | payment-links | manual-payment
    action:        (id, action, body) => apiRequest('POST', `/platform/organizations/${id}/${action}`, body || {}),
  },

  categories: {
    list: () => apiRequest('GET', '/categories'),
  },

  dashboard: {
    summary: () => apiRequest('GET', '/dashboard/summary'),
  },

  reports: {
    sales: (from, to) =>
      apiRequest('GET', `/reports/sales?from=${from}&to=${to}`),
    topProducts: (limit) =>
      apiRequest('GET', `/reports/top-products?limit=${limit || 10}`),
  },

  predictions: {
    forProduct: (id) =>
      apiRequest('GET', `/predictions/${id}`),
    recommendations: () =>
      apiRequest('GET', '/predictions/recommendations'),
  },
};

// ── Formatters ────────────────────────────────────────────
export const fmt = (v) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(v || 0);

export const fmtDate = (dateStr) => {
  if (!dateStr) return '—';

  return new Date(dateStr).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};