/**
 * StockMind React — Cliente HTTP centralizado
 * Migrado desde vanilla JS, misma lógica, mismo gateway Node.js (puerto 3000).
 */

const BASE_URL = 'http://localhost:3000/api';

// ── Auth helpers ──────────────────────────────────────────
export const Auth = {
  getToken:     () => localStorage.getItem('sm_token'),
  getUser:      () => JSON.parse(localStorage.getItem('sm_user') || 'null'),
  setSession:   (token, user) => {
    localStorage.setItem('sm_token', token);
    localStorage.setItem('sm_user', JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem('sm_token');
    localStorage.removeItem('sm_user');
  },
  isAdmin:    () => Auth.getUser()?.role === 'ADMIN',
  isLoggedIn: () => !!Auth.getToken(),
};

// ── Fetch base ────────────────────────────────────────────
async function apiRequest(method, endpoint, body = null) {
  const token = Auth.getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const options = {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    if (response.status === 401) {
      Auth.clearSession();
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
      throw new Error('No se puede conectar con el servidor. Verifique que el gateway esté activo.');
    }
    throw error;
  }
}

// ── API pública ───────────────────────────────────────────
export const API = {
  auth: {
    login: (data) => apiRequest('POST', '/auth/login', data),
    me:    ()     => apiRequest('GET',  '/auth/me'),
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
    movements: (productId) => apiRequest('GET',  `/inventory/movements${productId ? `?productId=${productId}` : ''}`),
    register:  (data)      => apiRequest('POST', '/inventory/movements', data),
  },
  sales: {
    list:   (from, to) => apiRequest('GET',  `/sales${from ? `?from=${from}&to=${to}` : ''}`),
    get:    (id)       => apiRequest('GET',  `/sales/${id}`),
    create: (data)     => apiRequest('POST', '/sales', data),
  },
  reports: {
    sales:       (from, to) => apiRequest('GET', `/reports/sales?from=${from}&to=${to}`),
    topProducts: (limit)    => apiRequest('GET', `/reports/top-products?limit=${limit || 10}`),
  },
  predictions: {
    forProduct:      (id) => apiRequest('GET', `/predictions/${id}`),
    recommendations: ()   => apiRequest('GET', '/predictions/recommendations'),
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
