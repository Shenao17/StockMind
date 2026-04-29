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

const PAGE_TITLES = {
  '/dashboard':   'Dashboard',
  '/products':    'Productos',
  '/inventory':   'Control de Inventario',
  '/sales':       'Ventas',
  '/reports':     'Reportes',
  '/predictions': 'Predicción de Demanda',
  '/users':       'Gestión de Usuarios',
};

function ProtectedLayout({ showToast }) {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn()) return <Navigate to="/" replace />;

  const title = PAGE_TITLES[location.pathname] || 'StockMind';

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
        <span className="topbar-title">{title}</span>
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
    </div>
  );
}

function DateDisplay() {
  return (
    <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    </span>
  );
}

// Estos componentes se usan para pasar referencias de apertura de modal desde el topbar.
// Como los modales viven en cada página, los botones del topbar simplemente disparan
// eventos custom que las páginas escuchan.
function ProductsTopbar({ showToast }) {
  const { useAuth: ua } = { useAuth };
  return null; // El botón "+ Nuevo producto" vive dentro de Products.jsx con acceso a su estado
}
function InventoryTopbar() { return null; }
function SalesTopbar() { return null; }
function PredictionsTopbar() { return null; }

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
