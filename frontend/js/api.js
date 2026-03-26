/**
 * StockMind Frontend — Cliente HTTP centralizado
 * ================================================
 * Todas las peticiones al backend pasan por este módulo.
 * Gestiona automáticamente:
 *   - El token JWT (lectura de localStorage e inyección en headers)
 *   - Redirección a login si el token expira (401)
 *   - Manejo unificado de errores
 *
 * BASE_URL apunta al gateway Node.js (puerto 3000).
 * El frontend NUNCA llama directamente a Java (8080) ni Python (8000).
 */

const BASE_URL = 'http://localhost:3000/api';

// ─────────────────────────────────────────────────────────
// Helpers de autenticación
// ─────────────────────────────────────────────────────────

const Auth = {
    getToken:    () => localStorage.getItem('sm_token'),
    getUser:     () => JSON.parse(localStorage.getItem('sm_user') || 'null'),
    setSession:  (token, user) => {
        localStorage.setItem('sm_token', token);
        localStorage.setItem('sm_user', JSON.stringify(user));
    },
    clearSession: () => {
        localStorage.removeItem('sm_token');
        localStorage.removeItem('sm_user');
    },
    isAdmin:     () => Auth.getUser()?.role === 'ADMIN',
    isLoggedIn:  () => !!Auth.getToken()
};

// ─────────────────────────────────────────────────────────
// Función de fetch base con manejo de errores y JWT
// ─────────────────────────────────────────────────────────

async function apiRequest(method, endpoint, body = null) {
    const token = Auth.getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };

    const options = {
        method,
        headers,
        ...(body && { body: JSON.stringify(body) })
    };

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options);

        // Token expirado o inválido → redirigir a login
        if (response.status === 401) {
            Auth.clearSession();
            window.location.href = '/index.html';
            return null;
        }

        // Intentar parsear JSON; si falla retornar texto plano
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

// ─────────────────────────────────────────────────────────
// API pública — métodos por módulo
// ─────────────────────────────────────────────────────────

const API = {

    // AUTH
    auth: {
        login:   (data)     => apiRequest('POST', '/auth/login', data),
        me:      ()         => apiRequest('GET',  '/auth/me')
    },

    // USUARIOS
    users: {
        list:    ()         => apiRequest('GET',    '/users'),
        create:  (data)     => apiRequest('POST',   '/users', data),
        update:  (id, data) => apiRequest('PUT',    `/users/${id}`, data),
        remove:  (id)       => apiRequest('DELETE', `/users/${id}`)
    },

    // PRODUCTOS
    products: {
        list:      ()         => apiRequest('GET',    '/products'),
        get:       (id)       => apiRequest('GET',    `/products/${id}`),
        lowStock:  ()         => apiRequest('GET',    '/products/low-stock'),
        create:    (data)     => apiRequest('POST',   '/products', data),
        update:    (id, data) => apiRequest('PUT',    `/products/${id}`, data),
        remove:    (id)       => apiRequest('DELETE', `/products/${id}`)
    },

    // INVENTARIO
    inventory: {
        movements: (productId) => apiRequest('GET', `/inventory/movements${productId ? `?productId=${productId}` : ''}`),
        register:  (data)      => apiRequest('POST', '/inventory/movements', data)
    },

    // VENTAS
    sales: {
        list:   (from, to) => apiRequest('GET', `/sales${from ? `?from=${from}&to=${to}` : ''}`),
        get:    (id)       => apiRequest('GET',  `/sales/${id}`),
        create: (data)     => apiRequest('POST', '/sales', data)
    },

    // REPORTES
    reports: {
        sales:       (from, to) => apiRequest('GET', `/reports/sales?from=${from}&to=${to}`),
        topProducts: (limit)    => apiRequest('GET', `/reports/top-products?limit=${limit || 10}`)
    },

    // PREDICCIONES
    predictions: {
        forProduct:      (id)  => apiRequest('GET', `/predictions/${id}`),
        recommendations: ()    => apiRequest('GET', '/predictions/recommendations')
    }
};

// ─────────────────────────────────────────────────────────
// Sistema de toast notifications
// ─────────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', warning: '⚠' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─────────────────────────────────────────────────────────
// Guardián de rutas — verifica sesión activa
// ─────────────────────────────────────────────────────────

function requireAuth() {
    if (!Auth.isLoggedIn()) {
        window.location.href = '/index.html';
        return false;
    }
    return true;
}

function requireAdmin() {
    if (!Auth.isAdmin()) {
        showToast('Acceso denegado: se requiere rol Administrador', 'error');
        return false;
    }
    return true;
}

// Exportar para uso en otros módulos (si se usa como módulo ES)
// En el frontend sin bundler, estas variables quedan globales en window
window.API   = API;
window.Auth  = Auth;
window.showToast   = showToast;
window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
