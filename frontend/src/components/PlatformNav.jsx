import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** PlatformNav — Navegación del panel de plataforma; solo muestra lo que el rol puede ver. */
export default function PlatformNav() {
  const { user } = useAuth() || {};
  const can = (p) => (user?.permissions || []).includes(p);
  const items = [
    { to: '/platform', label: 'Resumen', end: true, show: true },
    { to: '/platform/companies', label: 'Empresas', show: true },
    { to: '/platform/payments', label: 'Cobros', show: can('PAYMENT_VIEW') },
    { to: '/platform/audit', label: 'Auditoría', show: can('AUDIT_VIEW') },
    { to: '/platform/team', label: 'Equipo', show: can('TEAM_MANAGE') },
  ].filter((i) => i.show);

  return (
    <nav className="platform-tabs" aria-label="Secciones del panel">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}
          className={({ isActive }) => `btn btn-ghost btn-sm${isActive ? ' active' : ''}`}>{i.label}</NavLink>
      ))}
    </nav>
  );
}
