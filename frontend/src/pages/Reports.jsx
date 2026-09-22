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
    if (!dateFrom || !dateTo) {
      showToast?.('Seleccione rango de fechas', 'warning');
      return;
    }

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
    <div className="reports-page">

      {/* ── Encabezado ───────────────────────────────────── */}
      <div className="reports-hero">
        <div>
          <span className="reports-eyebrow">ANÁLISIS</span>
          <h1>Reportes</h1>
          <p>
            Consulta el comportamiento de las ventas y los productos con mayor movimiento.
          </p>
        </div>

        <div className="reports-hero-mark">
          <span>REPORTS</span>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────── */}
      <div className="reports-filter-card">
        <div className="reports-filter-heading">
          <div>
            <span className="reports-section-label">PERÍODO</span>
            <h2>Generar reporte</h2>
          </div>

          <span className="reports-filter-status">
            {dateFrom} → {dateTo}
          </span>
        </div>

        <div className="reports-filter-controls">
          <div className="form-group reports-date-field">
            <label>Fecha inicio</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>

          <div className="reports-date-arrow">→</div>

          <div className="form-group reports-date-field">
            <label>Fecha fin</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary reports-generate-btn"
            onClick={generateReport}
            disabled={reportLoading}
          >
            {reportLoading ? 'Generando...' : 'Generar reporte'}
          </button>
        </div>
      </div>

      {/* ── Resumen ──────────────────────────────────────── */}
      {summary && (
        <div className="reports-summary">
          <div className="reports-summary-intro">
            <span className="reports-section-label">RESUMEN</span>
            <h2>Rendimiento del período</h2>
          </div>

          <div className="reports-stats-grid">

            <div className="reports-stat-card reports-stat-main">
              <div className="reports-stat-top">
                <span className="reports-stat-label">TOTAL VENDIDO</span>
                <span className="reports-stat-icon">↗</span>
              </div>

              <div className="reports-stat-value reports-stat-success">
                {fmt(summary.totalRevenue)}
              </div>

              <span className="reports-stat-caption">
                Ingresos registrados
              </span>
            </div>

            <div className="reports-stat-card">
              <div className="reports-stat-top">
                <span className="reports-stat-label">TRANSACCIONES</span>
                <span className="reports-stat-icon">#</span>
              </div>

              <div className="reports-stat-value reports-stat-accent">
                {summary.totalSales}
              </div>

              <span className="reports-stat-caption">
                Ventas realizadas
              </span>
            </div>

            <div className="reports-stat-card">
              <div className="reports-stat-top">
                <span className="reports-stat-label">PROMEDIO POR VENTA</span>
                <span className="reports-stat-icon">≈</span>
              </div>

              <div className="reports-stat-value">
                {fmt(summary.averageSale)}
              </div>

              <span className="reports-stat-caption">
                Valor medio de transacción
              </span>
            </div>

          </div>
        </div>
      )}

      {/* ── Top productos ────────────────────────────────── */}
      <div className="reports-section table-container">

        <div className="reports-section-header table-header">
          <div>
            <span className="reports-section-label">PRODUCTOS</span>
            <h2>Top productos más vendidos</h2>
          </div>

          <span className="reports-period-badge">
            ÚLTIMOS 30 DÍAS
          </span>
        </div>

        {topLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            Cargando...
          </div>
        ) : topProducts.length === 0 ? (
          <div className="reports-empty">
            <div className="reports-empty-icon">∅</div>
            <strong>Sin datos disponibles</strong>
            <span>No hay información suficiente para mostrar productos.</span>
          </div>
        ) : (
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Unidades vendidas</th>
                  <th>Total generado</th>
                </tr>
              </thead>

              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.productId}>
                    <td>
                      <span className={`reports-rank ${i < 3 ? 'reports-rank-top' : ''}`}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </td>

                    <td>
                      <div className="reports-product-name">
                        <strong>{p.productName}</strong>
                      </div>
                    </td>

                    <td>
                      <span className="reports-sku mono">
                        {p.sku}
                      </span>
                    </td>

                    <td>
                      <span className="reports-quantity mono">
                        {p.totalQuantity}
                      </span>
                    </td>

                    <td>
                      <strong className="reports-revenue mono">
                        {fmt(p.totalRevenue)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Ventas del período ───────────────────────────── */}
      {salesReport.length > 0 && (
        <div className="reports-section table-container">

          <div className="reports-section-header table-header">
            <div>
              <span className="reports-section-label">TRANSACCIONES</span>
              <h2>Ventas del período</h2>
            </div>

            <span className="reports-count-badge">
              {salesReport.length} registro{salesReport.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendedor</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>

              <tbody>
                {salesReport.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="reports-sale-id mono">
                        #{s.id}
                      </span>
                    </td>

                    <td>
                      <strong>{s.user?.username || '—'}</strong>
                    </td>

                    <td>
                      <strong className="reports-revenue mono">
                        {fmt(s.total)}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          s.status === 'COMPLETED'
                            ? 'badge-success'
                            : 'badge-muted'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>

                    <td>
                      <span className="reports-date mono">
                        {fmtDate(s.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}