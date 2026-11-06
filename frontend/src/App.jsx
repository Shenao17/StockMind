import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/ToastContainer';
import Sidebar from './components/layout/Sidebar';

import Login from './pages/Login';
import VerifyEmail from './pages/VerifyEmail';
import Pay from './pages/Pay';
import Billing from './pages/Billing';
import Platform from './pages/Platform';
import Security from './pages/Security';
import { isPlatformRole, PLATFORM_ROLE_LABELS } from './platformRoles';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { useSubscription } from './context/subscriptionState';
import PlanBanner from './components/ui/PlanBanner';
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
  const { isLoggedIn, user, logout } = useAuth();

  if (!isLoggedIn()) return <Navigate to="/" replace />;

  // El dueño de la plataforma no tiene empresa: solo ve su panel
  if (isPlatformRole(user.role)) {
    return (
      <div className="app-layout platform-layout">
        <header className="topbar">
          <div className="topbar-heading">
            <span className="topbar-title">{PAGE_TITLES['/platform']}</span>
            <span className="topbar-subtitle">{PAGE_SUBTITLES['/platform']}</span>
          </div>
          <div className="topbar-actions">
            <span className="mono" style={{ fontSize: '.8rem' }}>{user.fullName || user.email} · {PLATFORM_ROLE_LABELS[user.role]}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Cerrar sesión</button>
          </div>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="/platform" element={<Platform showToast={showToast} />} />
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
    <div className="app-layout">
      <Sidebar />

      <header className="topbar">
        <div className="topbar-heading">
          <span className="topbar-title">{title}</span>
          <span className="topbar-subtitle">{subtitle}</span>
        </div>

        <div className="topbar-actions">
          {location.pathname === '/dashboard' && <DateDisplay />}
          {topbarActions}
        </div>
      </header>

      <main className="main-content">
        <PlanBanner />
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
      </main>

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
  const { toasts, showToast } = useToast();

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/pay/:reference" element={<Pay />} />
          <Route path="/*" element={<ProtectedLayout showToast={showToast} />} />
        </Routes>

        <ToastContainer toasts={toasts} />
      </BrowserRouter>
    </AuthProvider>
  );
}