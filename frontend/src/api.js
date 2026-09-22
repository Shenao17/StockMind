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
      throw new Error(errorMsg);
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

// ── API pública ───────────────────────────────────────────
export const API = {
  auth: {
    login:  (data) => apiRequest('POST', '/auth/login', data),
    logout: ()     => apiRequest('POST', '/auth/logout'),
    me:     ()     => apiRequest('GET',  '/auth/me'),
  },

  users: {
    list:   ()         => apiRequest('GET',    '/users'),
    create: (data)     => apiRequest('POST',   '/users', data),
    update: (id, data) => apiRequest('PUT',    `/users/${id}`, data),
    remove: (id)       => apiRequest('DELETE', `/users/${id}`),
  },

  products: {
    list:     ()         => apiRequest('GET',    '/products'),
    get:      (id)       => apiRequest('GET',    `/products/${id}`),
    lowStock: ()         => apiRequest('GET',    '/products/low-stock'),
    create:   (data)     => apiRequest('POST',   '/products', data),
    update:   (id, data) => apiRequest('PUT',    `/products/${id}`, data),
    remove:   (id)       => apiRequest('DELETE', `/products/${id}`),
  },

  inventory: {
    movements: (productId) =>
      apiRequest(
        'GET',
        `/inventory/movements${productId ? `?productId=${productId}` : ''}`
      ),
    register: (data) =>
      apiRequest('POST', '/inventory/movements', data),
  },

  sales: {
    list:   (from, to) =>
      apiRequest('GET', `/sales${from ? `?from=${from}&to=${to}` : ''}`),
    get:    (id) =>
      apiRequest('GET', `/sales/${id}`),
    create: (data) =>
      apiRequest('POST', '/sales', data),
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