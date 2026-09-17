import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ui/ToastContainer';
import Sidebar from './components/layout/Sidebar';

import Login from './pages/Login';
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
};

const PAGE_SUBTITLES = {
  '/dashboard':   'Vista general de tu operación',
  '/products':    'Gestiona el catálogo de productos',
  '/inventory':   'Supervisa el estado de tu inventario',
  '/sales':       'Consulta y administra tus ventas',
  '/reports':     'Analiza el rendimiento de tu negocio',
  '/predictions': 'Anticipa la demanda de tus productos',
  '/users':       'Administra los usuarios del sistema',
};

function ProtectedLayout({ showToast }) {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn()) return <Navigate to="/" replace />;

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
        <Routes>
          <Route path="/dashboard"   element={<Dashboard   showToast={showToast} />} />
          <Route path="/products"    element={<Products    showToast={showToast} />} />
          <Route path="/inventory"   element={<Inventory   showToast={showToast} />} />
          <Route path="/sales"       element={<Sales       showToast={showToast} />} />
          <Route path="/reports"     element={<Reports     showToast={showToast} />} />
          <Route path="/predictions" element={<Predictions showToast={showToast} />} />
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
          <Route path="/*" element={<ProtectedLayout showToast={showToast} />} />
        </Routes>

        <ToastContainer toasts={toasts} />
      </BrowserRouter>
    </AuthProvider>
  );
}