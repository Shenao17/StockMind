/** Páginas del menú de la empresa (las usan el menú lateral, la barra inferior y el buscador). */
export const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', section: 'Principal' },
  { to: '/products', icon: 'products', label: 'Productos' },
  { to: '/inventory', icon: 'inventory', label: 'Inventario', alert: 'lowStock' },
  { to: '/sales', icon: 'sales', label: 'Ventas' },
  { to: '/predictions', icon: 'predictions', label: 'Predicciones', section: 'Analítica', feature: 'PREDICTIONS' },
  { to: '/reports', icon: 'reports', label: 'Reportes', feature: 'REPORTS' },
  { to: '/users', icon: 'users', label: 'Usuarios', section: 'Administración', adminOnly: true },
];

/** Lo de la cuenta vive en el menú del usuario. */
export const ACCOUNT_ITEMS = [
  { to: '/billing', icon: 'billing', label: 'Plan y pagos' },
  { to: '/security', icon: 'security', label: 'Seguridad' },
];
