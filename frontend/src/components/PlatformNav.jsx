import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';

/** PlatformNav — Navegación del panel de plataforma; solo muestra lo que el rol puede ver. */
export default function PlatformNav() {
  const { user } = useAuth() || {};
  const can = (p) => (user?.permissions || []).includes(p);
  const location = useLocation();
  const reviewer = can('REQUEST_REVIEW');
  const [pending, setPending] = useState(0);
  const [tick, setTick] = useState(0);

  // Las pantallas avisan cuando una solicitud cambia de estado
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener('platform:requests-changed', onChange);
    return () => window.removeEventListener('platform:requests-changed', onChange);
  }, []);

  // El dueño ve cuántas solicitudes esperan su decisión (se refresca al cambiar de pantalla)
  useEffect(() => {
    if (!reviewer) return undefined;
    let cancelled = false;
    API.platform.requests({ status: 'PENDING', size: 1 })
      .then((r) => !cancelled && setPending(r.totalElements))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reviewer, location.pathname, tick]);
  const items = [
    { to: '/platform', label: 'Resumen', end: true, show: true },
    { to: '/platform/companies', label: 'Empresas', show: true },
    { to: '/platform/payments', label: 'Cobros', show: can('PAYMENT_VIEW') },
    { to: '/platform/requests', label: 'Solicitudes', show: can('REQUEST_CREATE') || reviewer, badge: pending },
    { to: '/platform/audit', label: 'Auditoría', show: can('AUDIT_VIEW') },
    { to: '/platform/plans', label: 'Planes', show: can('PLANS_MANAGE') },
    { to: '/platform/team', label: 'Equipo', show: can('TEAM_MANAGE') },
  ].filter((i) => i.show);

  return (
    <nav className="platform-tabs" aria-label="Secciones del panel">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}
          className={({ isActive }) => `btn btn-ghost btn-sm${isActive ? ' active' : ''}`}>{i.label}{i.badge > 0 && <span className="nav-badge" aria-label={`${i.badge} pendientes`}>{i.badge}</span>}</NavLink>
      ))}
    </nav>
  );
}
