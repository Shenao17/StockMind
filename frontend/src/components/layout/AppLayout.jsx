import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';

export default function AppLayout({ topbarTitle, topbarActions }) {
  const { isLoggedIn } = useAuth();

  if (!isLoggedIn()) return <Navigate to="/" replace />;

  return (
    <div className="app-layout">
      <Sidebar />
      <header className="topbar">
        <span className="topbar-title">{topbarTitle}</span>
        <div className="topbar-actions">{topbarActions}</div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
