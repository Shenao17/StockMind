import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/subscriptionState';
import BrandLogo from '../ui/BrandLogo';

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', section: 'Principal' },
  { to: '/products', icon: 'products', label: 'Productos' },
  { to: '/inventory', icon: 'inventory', label: 'Inventario' },
  { to: '/sales', icon: 'sales', label: 'Ventas' },
  { to: '/predictions', icon: 'predictions', label: 'Predicciones', section: 'Analítica', feature: 'PREDICTIONS' },
  { to: '/reports', icon: 'reports', label: 'Reportes', feature: 'REPORTS' },
  { to: '/users', icon: 'users', label: 'Usuarios', section: 'Administración', adminOnly: true },
  { to: '/billing', icon: 'billing', label: 'Plan y pagos', section: 'Cuenta' },
  { to: '/security', icon: 'security', label: 'Seguridad' },
];

function NavIcon({ type }) {
  const paths = {
    security: (
      <>
        <path d="M12 3 5 6v5c0 4.5 2.9 8.2 7 10 4.1-1.8 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    products: (
      <>
        <path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" />
        <path d="m4 12 8 4.5 8-4.5" />
        <path d="m4 16.5 8 4.5 8-4.5" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
        <path d="M7 4v16" />
      </>
    ),
    sales: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 3-4 3 2 5-6" />
      </>
    ),
    predictions: (
      <>
        <path d="M4 17 9 12l3 3 8-9" />
        <path d="M16 6h4v4" />
        <path d="M4 20h16" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </>
    ),
    billing: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),
    users: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6" />
      </>
    ),
  };

  return (
    <svg
      className="nav-icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  );
}

/**
 * Sidebar — Menú lateral.
 *  - Escritorio: completo (logo, etiquetas, usuario).
 *  - Tablet (769–1024 px): compacto, solo íconos (el nombre sale como ayuda al pasar el cursor).
 *  - Celular (≤ 768 px): cajón que se abre con el botón ☰ de la barra superior; se cierra con la X, tocando
 *    fuera, con Esc o al elegir una sección. `open` y `onClose` solo importan en celular.
 */
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout, isAdmin } = useAuth();
  const { hasFeature } = useSubscription();

  // Con el cajón abierto: Esc lo cierra, no se desplaza la página de atrás y se oculta la burbuja del asistente
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('nav-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('nav-open');
    };
  }, [open, onClose]);

  return (
    <>
    {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="app-sidebar" aria-label="Navegación principal">
      <button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar menú">✕</button>
      <div className="sidebar-logo">
        <div className="sidebar-brand">

          <div>
            <h1>
              <BrandLogo height={34} className="brand-full" />
              <BrandLogo variant="icon" height={34} alt="" className="brand-icon" />
            </h1>
            <span>Gestión inteligente</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin()) return null;

          return (
            <div key={item.to} className="nav-group">
              {item.section && (
                <span className="nav-section-label">
                  {item.section}
                </span>
              )}

              <NavLink
                to={item.to}
                title={item.label}
                onClick={onClose}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                <span className="nav-icon">
                  <NavIcon type={item.icon} />
                </span>

                <span className="nav-label">
                  {item.label}
                </span>

                {item.feature && !hasFeature(item.feature) && (
                  <span className="nav-lock" title="No incluido en tu plan" aria-label="No incluido en tu plan">🔒</span>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <div className="user-avatar">
          {user?.username?.charAt(0).toUpperCase() || '?'}
        </div>

        <div className="user-info">
          <div className="user-name">
            {user?.username || '—'}
          </div>

          <div className="user-role">
            {user?.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
          </div>
        </div>

        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={logout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <svg className="logout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
          </svg>
          <span className="logout-label">Cerrar sesión</span>
        </button>
      </div>
    </aside>
    </>
  );
}