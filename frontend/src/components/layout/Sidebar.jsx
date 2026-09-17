import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', section: 'Principal' },
  { to: '/products', icon: 'products', label: 'Productos' },
  { to: '/inventory', icon: 'inventory', label: 'Inventario' },
  { to: '/sales', icon: 'sales', label: 'Ventas' },
  { to: '/predictions', icon: 'predictions', label: 'Predicciones', section: 'Analítica' },
  { to: '/reports', icon: 'reports', label: 'Reportes' },
  { to: '/users', icon: 'users', label: 'Usuarios', section: 'Administración', adminOnly: true },
];

function NavIcon({ type }) {
  const paths = {
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

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-brand">

          <div>
            <h1>StockMind</h1>
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
  > 
    Cerrar Sesion
  </button>
      </div>
    </aside>
  );
}