import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard',   icon: '⊞', label: 'Dashboard',   section: 'Principal' },
  { to: '/products',    icon: '◈', label: 'Productos' },
  { to: '/inventory',   icon: '⊟', label: 'Inventario' },
  { to: '/sales',       icon: '◉', label: 'Ventas' },
  { to: '/predictions', icon: '◈', label: 'Predicciones', section: 'Analítica' },
  { to: '/reports',     icon: '⊡', label: 'Reportes' },
  { to: '/users',       icon: '◎', label: 'Usuarios',     section: 'Administración', adminOnly: true },
];

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>StockMind</h1>
        <span>Gestión de Inventario</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin()) return null;
          return (
            <div key={item.to}>
              {item.section && (
                <span className="nav-section-label">{item.section}</span>
              )}
              <NavLink
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
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
          <div className="user-name">{user?.username || '—'}</div>
          <div className="user-role">
            {user?.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={logout} title="Cerrar sesión">
          ⎋
        </button>
      </div>
    </aside>
  );
}
