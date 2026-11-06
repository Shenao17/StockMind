import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';

export default function Dashboard({ showToast }) {
  const [stats, setStats] = useState({ products: 0, lowStock: 0, salesToday: 0, salesTodayCount: 0, salesMonth: 0 });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line
  }, []);

  async function loadDashboard() {
    try {
      // Los totales los calcula el servidor: ya no se descargan todas las ventas y productos
      const summary = await API.dashboard.summary();

      setStats({
        products: summary.activeProducts || 0,
        lowStock: summary.lowStockCount || 0,
        salesToday: summary.salesToday?.total || 0,
        salesTodayCount: summary.salesToday?.count || 0,
        salesMonth: summary.salesMonth?.total || 0,
      });
      setLowStockItems(summary.lowStockItems || []);
      setRecentSales(summary.recentSales || []);
    } catch (err) {
      showToast?.('Error cargando el dashboard: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <>
      {stats.lowStock > 0 && (
        <div className="alert-banner" style={{ display: 'flex' }}>
          ⚠ <strong style={{ margin: '0 4px' }}>{stats.lowStock}</strong> producto(s) con stock crítico.
          <Link to="/inventory" style={{ marginLeft: 8 }}>Ver inventario →</Link>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Ventas hoy</div>
          <div className="stat-value accent">{fmt(stats.salesToday)}</div>
          <div className="stat-sub">{stats.salesTodayCount} transacciones</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Productos activos</div>
          <div className="stat-value">{stats.products}</div>
          <div className="stat-sub">en catálogo</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock crítico</div>
          <div className="stat-value danger">{stats.lowStock}</div>
          <div className="stat-sub">productos bajo mínimo</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ventas del mes</div>
          <div className="stat-value success">{fmt(stats.salesMonth)}</div>
          <div className="stat-sub">total acumulado</div>
        </div>
      </div>

      {/* Tabla stock crítico */}
      <div className="table-container" style={{ marginBottom: 24 }}>
        <div className="table-header">
          <h2>⚠ Productos con Stock Crítico</h2>
          <Link to="/inventory" className="btn btn-ghost btn-sm">Ver todos</Link>
        </div>
        {lowStockItems.length === 0 ? (
          <div className="loading-state" style={{ color: 'var(--success)' }}>✓ Todos los productos tienen stock suficiente</div>
        ) : (
          <table>
            <thead><tr><th>Producto</th><th>SKU</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th></tr></thead>
            <tbody>
              {lowStockItems.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.sku}</td>
                  <td><strong style={{ color: 'var(--danger)' }}>{p.stockCurrent}</strong></td>
                  <td>{p.stockMinimum}</td>
                  <td><span className="badge badge-danger">CRÍTICO</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ventas recientes */}
      <div className="table-container">
        <div className="table-header">
          <h2>Ventas Recientes</h2>
          <Link to="/sales" className="btn btn-ghost btn-sm">Ver todas</Link>
        </div>
        {recentSales.length === 0 ? (
          <div className="loading-state">Sin ventas registradas</div>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Vendedor</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              {recentSales.map(s => (
                <tr key={s.id}>
                  <td className="mono">#{s.id}</td>
                  <td>{s.user?.username || '—'}</td>
                  <td><strong>{fmt(s.total)}</strong></td>
                  <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-success' : 'badge-muted'}`}>{s.status}</span></td>
                  <td className="mono">{fmtDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
