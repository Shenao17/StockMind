import { useEffect, useState } from 'react';
import { API } from '../api';

export default function Predictions({ showToast }) {
  const [view, setView] = useState('predict'); // 'predict' | 'recommendations'
  const [allProducts, setAllProducts] = useState([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [recsLoading, setRecsLoading] = useState(false);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    try {
      const data = await API.products.list() || [];
      setAllProducts(data);
    } catch (e) {
      showToast?.('Error cargando productos: ' + e.message, 'error');
    }
  }

  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  async function selectProduct(id) {
    setSelectedId(id);
    setForecastLoading(true);
    setForecastError(null);
    setForecast(null);
    try {
      const data = await API.predictions.forProduct(id);
      setForecast(data);
    } catch (e) {
      setForecastError(e.message);
    } finally {
      setForecastLoading(false);
    }
  }

  async function loadRecommendations() {
    setView('recommendations');
    setRecsLoading(true);
    try {
      const data = await API.predictions.recommendations();
      setRecommendations(data);
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
      setRecommendations(null);
    } finally {
      setRecsLoading(false);
    }
  }

  const modelLabel = (m) => {
    if (m === 'linear_regression') return 'Regresión Lineal';
    if (m === 'weighted_moving_avg') return 'Media Móvil Ponderada';
    return 'Estimación base';
  };

  return (
    <>
      {view === 'predict' ? (
        <div className="predictions-grid">
          {/* Picker de productos */}
          <div className="product-picker">
            <div className="product-picker-header">Seleccionar Producto</div>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <input type="text" placeholder="Buscar..." value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)} />
            </div>
            <div className="product-picker-list">
              {filtered.map(p => (
                <div
                  key={p.id}
                  className={`picker-item${selectedId === p.id ? ' selected' : ''}`}
                  onClick={() => selectProduct(p.id)}
                >
                  <div>{p.name}</div>
                  <div className="picker-sku">{p.sku} — Stock: {p.stockCurrent}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Panel de forecast */}
          <div id="forecast-panel">
            {!selectedId && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>◈</div>
                <div>Seleccione un producto para ver su predicción de demanda</div>
                <div style={{ fontSize: '.78rem', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                  El análisis es generado en tiempo real por el microservicio Python
                </div>
              </div>
            )}
            {forecastLoading && <div className="loading-state"><div className="spinner" /> Generando predicción...</div>}
            {forecastError && (
              <div className="loading-state" style={{ color: 'var(--danger)' }}>
                Error al obtener predicción: {forecastError}<br />
                <small style={{ fontFamily: 'var(--font-mono)' }}>Verifique que el microservicio Python esté activo en puerto 8000</small>
              </div>
            )}
            {forecast && !forecastLoading && (
              <div>
                <div className="forecast-card">
                  <h3>
                    {forecast.productName}
                    <span className="model-badge">{modelLabel(forecast.modelUsed)}</span>
                  </h3>
                  <div className="forecast-values">
                    <div className="forecast-val">
                      <label>Demanda semanal estimada</label>
                      <strong>{forecast.weeklyForecast}</strong>
                      <span>unidades / semana</span>
                    </div>
                    <div className="forecast-val">
                      <label>Demanda mensual estimada</label>
                      <strong>{forecast.monthlyForecast}</strong>
                      <span>unidades / mes</span>
                    </div>
                    <div className="forecast-val">
                      <label>Promedio diario histórico</label>
                      <strong style={{ fontSize: '1.4rem' }}>{forecast.averageDailySales}</strong>
                      <span>unidades / día</span>
                    </div>
                    <div className="forecast-val">
                      <label>Semanas de historial</label>
                      <strong style={{ fontSize: '1.4rem' }}>{forecast.weeksOfHistory}</strong>
                      <span>semanas analizadas</span>
                    </div>
                  </div>
                  {forecast.confidence != null && (
                    <div className="confidence-bar" style={{ marginTop: 20 }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Confianza del modelo (R²)</span>
                        <span>{Math.round(forecast.confidence * 100)}%</span>
                      </label>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.round(forecast.confidence * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="forecast-card">
                  <h3>Recomendación de Reabastecimiento</h3>
                  <div className="recom-box">
                    <div className="recom-qty">{forecast.recommendation}</div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>unidades sugeridas a reabastecer</div>
                      <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
                        Stock actual: {forecast.stockCurrent} • Stock mínimo: {forecast.stockMinimum} •{' '}
                        {forecast.isCritical
                          ? <span style={{ color: 'var(--danger)' }}>⚠ NIVEL CRÍTICO</span>
                          : <span style={{ color: 'var(--success)' }}>✓ Stock suficiente</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                  Generado: {new Date(forecast.generatedAt).toLocaleString('es-CO')} • Período semana: {forecast.periodWeek} • Período mes: {forecast.periodMonth}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'var(--font-head)' }}>Recomendaciones de Reabastecimiento</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('predict')}>← Predicción por producto</button>
          </div>
          {recsLoading ? (
            <div className="loading-state"><div className="spinner" /> Consultando microservicio analítico...</div>
          ) : !recommendations ? (
            <div className="loading-state" style={{ color: 'var(--danger)' }}>No se pudieron cargar las recomendaciones</div>
          ) : (recommendations.recommendations || []).length === 0 ? (
            <div className="loading-state" style={{ color: 'var(--success)' }}>✓ No hay productos que requieran reabastecimiento urgente</div>
          ) : (
            <div className="table-container">
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: '.82rem', color: 'var(--text-muted)' }}>
                {recommendations.total} productos • <span style={{ color: 'var(--danger)' }}>{recommendations.critical} críticos</span>
              </div>
              <table>
                <thead><tr><th>Producto</th><th>SKU</th><th>Stock actual</th><th>Demanda semanal</th><th>Demanda mensual</th><th>Reabastecer</th><th>Estado</th></tr></thead>
                <tbody>
                  {recommendations.recommendations.map(r => (
                    <tr key={r.productId}>
                      <td><strong>{r.productName}</strong></td>
                      <td className="mono">{r.sku}</td>
                      <td><span style={{ color: r.isCritical ? 'var(--danger)' : 'var(--text)' }}>{r.stockCurrent}</span> / min {r.stockMinimum}</td>
                      <td className="mono">{r.weeklyForecast}</td>
                      <td className="mono">{r.monthlyForecast}</td>
                      <td><strong style={{ color: 'var(--accent)' }}>{r.recommendation}</strong> uds</td>
                      <td>{r.isCritical ? <span className="badge badge-danger">CRÍTICO</span> : <span className="badge badge-warning">REPONER</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
