import { useCallback, useEffect, useState } from 'react';
import { useTableLabels } from './hooks/useTableLabels';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/ToastContainer';
import NotificationBell from './components/ui/NotificationBell';
import { NotificationContext } from './context/notificationState';
import Sidebar from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';

import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import Pay from './pages/Pay';
import Billing from './pages/Billing';
import Platform from './pages/Platform';
import PlatformCompany from './pages/PlatformCompany';
import PlatformSummary from './pages/PlatformSummary';
import PlatformPayments from './pages/PlatformPayments';
import PlatformAudit from './pages/PlatformAudit';
import PlatformTeam from './pages/PlatformTeam';
import PlatformRequests from './pages/PlatformRequests';
import PlatformPlans from './pages/PlatformPlans';
import PlatformNav from './components/PlatformNav';
import BrandLogo from './components/ui/BrandLogo';
import Security from './pages/Security';
import { isPlatformRole, PLATFORM_ROLE_LABELS } from './platformRoles';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { useSubscription } from './context/subscriptionState';
import PlanBanner from './components/ui/PlanBanner';
import RouteProgress from './components/ui/RouteProgress';
import FeatureGate from './components/ui/FeatureGate';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Predictions from './pages/Predictions';
import Users from './pages/Users';
import AgentBubble from './components/ui/AgentBubble';

const PAGE_TITLES = {
  '/dashboard':   'Dashboard',
  '/products':    'Productos',
  '/inventory':   'Control de Inventario',
  '/sales':       'Ventas',
  '/reports':     'Reportes',
  '/predictions': 'Predicción de Demanda',
  '/users':       'Gestión de Usuarios',
  '/billing':     'Plan y facturación',
  '/security':    'Seguridad',
  '/platform':    'Panel de plataforma',
};

const PAGE_SUBTITLES = {
  '/dashboard':   'Vista general de tu operación',
  '/products':    'Gestiona el catálogo de productos',
  '/inventory':   'Supervisa el estado de tu inventario',
  '/sales':       'Consulta y administra tus ventas',
  '/reports':     'Analiza el rendimiento de tu negocio',
  '/predictions': 'Anticipa la demanda de tus productos',
  '/users':       'Administra los usuarios del sistema',
  '/billing':     'Tu plan, tu uso y tus cobros',
  '/security':    'Protege tu cuenta con la verificación en dos pasos',
  '/platform':    'Empresas, planes y cobros de StockMind',
};

function ProtectedLayout({ showToast }) {
  const { isLoggedIn, user, logout, loading } = useAuth();

  // Mientras se confirma la sesión (cookie) no se redirige: así al recargar una pantalla interior
  // (p. ej. /platform/payments) se vuelve a ella en vez de pasar por el login y caer en el inicio.
  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;
  if (!isLoggedIn()) return <Navigate to="/" replace />;

  // El dueño de la plataforma no tiene empresa: solo ve su panel
  if (isPlatformRole(user.role)) {
    return (
      <div className="app-layout platform-layout">
        <header className="topbar">
          <BrandLogo height={30} alt="StockMind" className="topbar-logo brand-full" />
          <BrandLogo variant="icon" height={30} alt="" className="topbar-logo brand-icon" />
          <div className="topbar-heading">
            <span className="topbar-title">{PAGE_TITLES['/platform']}</span>
            <span className="topbar-subtitle">{PAGE_SUBTITLES['/platform']}</span>
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <span className="mono topbar-user" style={{ fontSize: '.8rem' }}>{user.fullName || user.email} · {PLATFORM_ROLE_LABELS[user.role]}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Cerrar sesión</button>
          </div>
        </header>
        <main className="main-content">
          <PlatformNav />
          <Routes>
            <Route path="/platform" element={<PlatformSummary showToast={showToast} />} />
            <Route path="/platform/companies" element={<Platform showToast={showToast} />} />
            <Route path="/platform/orgs/:id" element={<PlatformCompany showToast={showToast} />} />
            <Route path="/platform/payments" element={<PlatformPayments showToast={showToast} />} />
            <Route path="/platform/audit" element={<PlatformAudit showToast={showToast} />} />
            <Route path="/platform/requests" element={<PlatformRequests showToast={showToast} />} />
            <Route path="/platform/plans" element={<PlatformPlans showToast={showToast} />} />
            <Route path="/platform/team" element={<PlatformTeam showToast={showToast} />} />
            <Route path="*" element={<Navigate to="/platform" replace />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <SubscriptionProvider>
      <CompanyLayout showToast={showToast} />
    </SubscriptionProvider>
  );
}

function CompanyLayout({ showToast }) {
  const location = useLocation();
  const { blocked } = useSubscription();
  const [navOpen, setNavOpen] = useState(false);          // cajón del menú (solo celular)
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Menú contraído (solo íconos): lo elige la persona en escritorio y se recuerda; en tablet siempre va contraído
  const [pref, setPref] = useState(() => { try { return localStorage.getItem('sm.nav.collapsed') === '1'; } catch { return false; } });
  const [tablet, setTablet] = useState(() => window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px) and (max-width: 1024px)');
    const on = (e) => setTablet(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const toggleCollapsed = useCallback(() => setPref((v) => {
    try { localStorage.setItem('sm.nav.collapsed', v ? '0' : '1'); } catch { /* sin almacenamiento */ }
    return !v;
  }), []);
  const collapsed = pref || tablet;

  const title = PAGE_TITLES[location.pathname] || 'StockMind';
  const subtitle = PAGE_SUBTITLES[location.pathname] || 'Gestión inteligente de inventario';

  // Topbar actions por página
  const topbarActions = {
    '/products':    <ProductsTopbar showToast={showToast} />,
    '/inventory':   <InventoryTopbar showToast={showToast} />,
    '/sales':       <SalesTopbar />,
    '/predictions': <PredictionsTopbar />,
  }[location.pathname];

  return (
    <div className={`app-layout${collapsed ? ' nav-collapsed' : ''}`}>
      <Sidebar open={navOpen} onClose={closeNav} collapsed={collapsed} onToggleCollapse={tablet ? null : toggleCollapsed} />

      <header className="topbar">
        <div className="topbar-start">
          <BrandLogo variant="icon" tone="white" height={30} alt="StockMind" className="topbar-mark" />
          <button type="button" className="nav-toggle" onClick={() => setNavOpen(true)}
            aria-label="Abrir menú" aria-expanded={navOpen} aria-controls="app-sidebar">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
            </svg>
          </button>
          <div className="topbar-heading">
            <span className="topbar-title">{title}</span>
            <span className="topbar-subtitle">{subtitle}</span>
          </div>
        </div>

        <div className="topbar-actions">
          {location.pathname === '/dashboard' && <DateDisplay />}
          {topbarActions}
          <NotificationBell />
        </div>
      </header>

      <main className="main-content">
        <PlanBanner />
        <div key={location.pathname} className="page-enter">
        <Routes>
          <Route path="/billing"     element={<Billing     showToast={showToast} />} />
          <Route path="/security"    element={<Security    showToast={showToast} />} />
          {blocked && <Route path="*" element={<Navigate to="/billing" replace />} />}
          <Route path="/dashboard"   element={<Dashboard   showToast={showToast} />} />
          <Route path="/products"    element={<Products    showToast={showToast} />} />
          <Route path="/inventory"   element={<Inventory   showToast={showToast} />} />
          <Route path="/sales"       element={<Sales       showToast={showToast} />} />
          <Route path="/reports"     element={<FeatureGate feature="REPORTS"><Reports showToast={showToast} /></FeatureGate>} />
          <Route path="/predictions" element={<FeatureGate feature="PREDICTIONS"><Predictions showToast={showToast} /></FeatureGate>} />
          <Route path="/users"       element={<Users       showToast={showToast} />} />
          <Route path="*"            element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </div>
      </main>

      <RouteProgress />
      <BottomNav onMore={() => setNavOpen(true)} />
      <AgentBubble />
    </div>
  );
}

function DateDisplay() {
  return (
    <div className="topbar-date">
      <span className="topbar-date-text">
        {new Date().toLocaleDateString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </span>
    </div>
  );
}

// Estos componentes se usan para pasar referencias de apertura de modal desde el topbar.
// Como los modales viven en cada página, los botones del topbar simplemente disparan
// eventos custom que las páginas escuchan.
function ProductsTopbar({ showToast }) {
  const { useAuth: ua } = { useAuth };
  return null; // El botón "+ Nuevo producto" vive dentro de Products.jsx con acceso a su estado
}

function InventoryTopbar() {
  return null;
}

function SalesTopbar() {
  return null;
}

function PredictionsTopbar() {
  return null;
}

export default function App() {
  useTableLabels();   // tablas como tarjetas en celular
  const notifications = useToast();
  const { showToast } = notifications;

  return (
    <AuthProvider>
      <NotificationContext.Provider value={notifications}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/pay/:reference" element={<Pay />} />
            <Route path="/*" element={<ProtectedLayout showToast={showToast} />} />
          </Routes>

          <ToastContainer />
        </BrowserRouter>
      </NotificationContext.Provider>
    </AuthProvider>
  );
}