import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/subscriptionState';
import BrandLogo from '../ui/BrandLogo';
import NavIcon from '../ui/NavIcon';
import CommandPalette from './CommandPalette';
import useLowStock from './useLowStock';
import { NAV_ITEMS, ACCOUNT_ITEMS } from './navItems';

const TRIAL_DAYS = 14;
const STATUS_SHORT = { ACTIVE: 'Activo', GRACE: 'En gracia', SUSPENDED: 'Suspendido', CANCELLED: 'Cancelado' };

/** Tarjeta del plan: prueba (días y barra), plan activo o estado que pide atención. */
function PlanCard({ onNavigate }) {
  const { subscription: sub } = useSubscription();
  if (!sub) return null;
  const trial = sub.status === 'TRIAL';
  const left = sub.trialDaysLeft ?? null;
  const used = trial && left != null ? Math.min(100, Math.max(0, Math.round(((TRIAL_DAYS - left) / TRIAL_DAYS) * 100))) : null;
  const bad = !trial && sub.status !== 'ACTIVE';
  return (
    <div className={`sb-plan${bad ? ' sb-plan-bad' : ''}`}>
      <div className="sb-plan-top">
        <strong>{sub.planName || 'Plan'}</strong>
        <span>{trial ? 'Prueba gratis' : (STATUS_SHORT[sub.status] || sub.status)}</span>
      </div>
      {used != null && (
        <>
          <div className="sb-plan-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} aria-label="Avance de la prueba"><i style={{ width: `${used}%` }} /></div>
          <small>{left === 0 ? 'Tu prueba termina hoy' : `Te quedan ${left} de ${TRIAL_DAYS} días`}</small>
        </>
      )}
      {(trial || bad) && (
        <NavLink to="/billing" className="sb-plan-cta" onClick={onNavigate}>{trial ? 'Elegir mi plan' : 'Revisar mi plan'}</NavLink>
      )}
    </div>
  );
}

/**
 * Sidebar — Menú lateral.
 *  - Escritorio: completo; se puede contraer a solo íconos (`collapsed`, la decide CompanyLayout).
 *  - Tablet (769–1024 px): contraído siempre.
 *  - Celular (≤ 768 px): cajón (se abre con "Más" de la barra inferior o ☰); se cierra con la X, tocando
 *    fuera, con Esc o al elegir una sección. `open` y `onClose` solo importan en celular.
 *  - Plan y pagos, Seguridad y Cerrar sesión viven en el menú del usuario (abajo).
 */
export default function Sidebar({ open = false, onClose = () => {}, collapsed = false, onToggleCollapse = null }) {
  const { user, logout, isAdmin } = useAuth();
  const { hasFeature } = useSubscription();
  const lowStock = useLowStock();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const meRef = useRef(null);

  const items = useMemo(() => NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin()), [isAdmin]);
  const searchable = useMemo(() => [...items, ...ACCOUNT_ITEMS], [items]);

  // Cajón abierto: Esc lo cierra, la página de atrás no se desplaza y se oculta la burbuja del asistente
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

  // Ctrl/Cmd + K abre el buscador
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // El menú del usuario se cierra al navegar, con Esc o al tocar fuera
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (meRef.current && !meRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const roleLabel = user?.role === 'ADMIN' ? 'Administrador' : 'Vendedor';

  return (
    <>
    {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="app-sidebar" aria-label="Navegación principal">
      <button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar menú">✕</button>

      <div className="sidebar-logo">
        <h1>
          <BrandLogo height={32} className="brand-full" />
          <BrandLogo variant="icon" height={32} alt="" className="brand-icon" />
        </h1>
        {onToggleCollapse && (
          <button type="button" className="sidebar-collapse" onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-pressed={collapsed} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
            <NavIcon type="chevron" />
          </button>
        )}
      </div>

      <button type="button" className="sidebar-search" onClick={() => setPaletteOpen(true)} title="Buscar o ir a… (Ctrl K)">
        <NavIcon type="search" />
        <span className="nav-label">Buscar o ir a…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav className="sidebar-nav">
        {items.map((item) => {
          const locked = item.feature && !hasFeature(item.feature);
          const alert = item.alert === 'lowStock' && lowStock > 0 ? lowStock : 0;
          return (
            <div key={item.to} className="nav-group">
              {item.section && <span className="nav-section-label">{item.section}</span>}
              <NavLink to={item.to} title={item.label} onClick={onClose}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon"><NavIcon type={item.icon} /></span>
                <span className="nav-label">{item.label}</span>
                {locked && <span className="nav-tag nav-tag-pro" title="No incluido en tu plan" aria-label="No incluido en tu plan"><NavIcon type="lock" />Pro</span>}
                {alert > 0 && <span className="nav-tag nav-tag-warn" title={`${alert} producto(s) con stock crítico`} aria-label={`${alert} con stock crítico`}>{alert}</span>}
              </NavLink>
            </div>
          );
        })}
      </nav>

      <PlanCard onNavigate={onClose} />

      <div className="sidebar-user" ref={meRef}>
        {menuOpen && (
          <div className="user-menu" role="menu">
            {ACCOUNT_ITEMS.map((i) => (
              <NavLink key={i.to} to={i.to} role="menuitem" className="user-menu-item" onClick={() => { setMenuOpen(false); onClose(); }}>
                <NavIcon type={i.icon} />{i.label}
              </NavLink>
            ))}
            <hr />
            <button type="button" role="menuitem" className="user-menu-item user-menu-out" onClick={logout}>
              <NavIcon type="logout" />Cerrar sesión
            </button>
          </div>
        )}
        <button type="button" className="user-trigger" onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu" aria-expanded={menuOpen} title={`${user?.username || ''} · ${roleLabel}`}>
          <span className="user-avatar">{user?.username?.charAt(0).toUpperCase() || '?'}</span>
          <span className="user-info">
            <span className="user-name">{user?.username || '—'}</span>
            <span className="user-role">{roleLabel}</span>
          </span>
          <NavIcon type="more" className="user-more" />
        </button>
      </div>
    </aside>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={searchable} />
    </>
  );
}
