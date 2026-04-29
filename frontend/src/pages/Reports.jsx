import { useEffect, useState } from 'react';
import { API, fmt, fmtDate } from '../api';

export default function Reports({ showToast }) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState(null);
  const [salesReport, setSalesReport] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => { loadTopProducts(); }, []);

  async function loadTopProducts() {
    try {
      const data = await API.reports.topProducts(10) || [];
      setTopProducts(data);
    } catch (e) {
      showToast?.('Error cargando top productos: ' + e.message, 'error');
    } finally {
      setTopLoading(false);
    }
  }

  async function generateReport() {
    if (!dateFrom || !dateTo) { showToast?.('Seleccione rango de fechas', 'warning'); return; }
    setReportLoading(true);
    try {
      const data = await API.reports.sales(dateFrom, dateTo);
      setSummary(data?.summary || null);
      setSalesReport(data?.sales || []);
    } catch (e) {
      showToast?.('Error generando reporte: ' + e.message, 'error');
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <>
      {/* Filtros */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label>Fecha inicio</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0, flex: 1 }}>
          <label>Fecha fin</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={generateReport} disabled={reportLoading}>
          {reportLoading ? 'Generando...' : 'Generar reporte'}
        </button>
      </div>

      {/* Resumen */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Total vendido</div>
            <div className="stat-value success">{fmt(summary.totalRevenue)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Transacciones</div>
            <div className="stat-value accent">{summary.totalSales}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Promedio por venta</div>
            <div className="stat-value">{fmt(summary.averageSale)}</div>
          </div>
        </div>
      )}

      {/* Top productos */}
      <div className="table-container" style={{ marginBottom: 24 }}>
        <div className="table-header"><h2>Top Productos Más Vendidos (últimos 30 días)</h2></div>
        {topLoading ? (
          <div className="loading-state"><div className="spinner" /> Cargando...</div>
        ) : topProducts.length === 0 ? (
          <div className="loading-state">Sin datos disponibles</div>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Producto</th><th>SKU</th><th>Unidades vendidas</th><th>Total generado</th></tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.productId}>
                  <td className="mono">{i + 1}</td>
                  <td><strong>{p.productName}</strong></td>
                  <td className="mono">{p.sku}</td>
                  <td className="mono">{p.totalQuantity}</td>
                  <td className="mono"><strong>{fmt(p.totalRevenue)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ventas del período */}
      {salesReport.length > 0 && (
        <div className="table-container">
          <div className="table-header"><h2>Ventas del Período</h2></div>
          <table>
            <thead><tr><th>#</th><th>Vendedor</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              {salesReport.map(s => (
                <tr key={s.id}>
                  <td className="mono">#{s.id}</td>
                  <td>{s.user?.username || '—'}</td>
                  <td className="mono"><strong>{fmt(s.total)}</strong></td>
                  <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-success' : 'badge-muted'}`}>{s.status}</span></td>
                  <td className="mono">{fmtDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
