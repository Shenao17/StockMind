import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';

const SUB_ORDER = [['TRIAL', 'En prueba'], ['ACTIVE', 'Activas'], ['GRACE', 'En gracia'], ['SUSPENDED', 'Suspendidas']];

/** Variación porcentual frente al mes anterior; null si no hay base para comparar. */
const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** PlatformSummary — Resumen del negocio: empresas por estado, pruebas por vencer, ingresos y cobros pendientes. */
export default function PlatformSummary({ showToast }) {
  const [s, setS] = useState(null);

  useEffect(() => {
    let cancelled = false;
    API.platform.summary()
      .then((d) => !cancelled && setS(d))
      .catch((e) => !cancelled && showToast?.('Error cargando el resumen: ' + e.message, 'error'));
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, []);

  if (!s) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  const r = s.revenue;
  const delta = r ? change(r.thisMonth.total, r.lastMonth.total) : null;

  return (
    <>
      <div className="stats-grid">
        {SUB_ORDER.map(([key, label]) => (
          <div className="stat-card" key={key}>
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${key === 'GRACE' && s.subscriptions[key] > 0 ? 'danger' : ''}`}>{s.subscriptions[key]}</div>
            <div className="stat-sub">{key === 'ACTIVE' ? `${s.complimentary} de cortesía` : 'empresas'}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-label">Altas (30 días)</div>
          <div className="stat-value accent">{s.newLast30Days}</div>
          <div className="stat-sub">{s.organizations.PENDING} sin verificar el correo</div>
        </div>
      </div>

      {r ? (
        <div className="stats-grid" aria-label="Ingresos">
          <div className="stat-card">
            <div className="stat-label">Cobrado este mes</div>
            <div className="stat-value success">{fmt(r.thisMonth.total)}</div>
            <div className="stat-sub">
              {r.thisMonth.count} cobros · neto {fmt(r.thisMonth.net)} · IVA {fmt(r.thisMonth.iva)}
              {delta !== null && <> · {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs mes anterior</>}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ingreso mensual recurrente</div>
            <div className="stat-value accent">{fmt(r.mrr)}</div>
            <div className="stat-sub">neto, sin IVA (anual ÷ 12, sin cortesías)</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobros pendientes</div>
            <div className="stat-value">{r.pendingCount}</div>
            <div className="stat-sub">{fmt(r.pendingTotal)} en enlaces vigentes</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cobros fallidos</div>
            <div className={`stat-value ${r.failedLast30Days > 0 ? 'danger' : ''}`}>{r.failedLast30Days}</div>
            <div className="stat-sub">últimos 30 días</div>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', margin: '8px 0 16px' }}>Tu rol no incluye ver los ingresos.</p>
      )}

      <div className="table-container" style={{ marginBottom: 16 }}>
        <div className="table-header"><h2>Pruebas por vencer (≤ {s.trialWarningDays} días)</h2></div>
        {s.trialsEnding.length === 0 ? <div className="loading-state">Ninguna prueba vence pronto</div> : (
          <table>
            <thead><tr><th>Empresa</th><th>Plan</th><th>Vence</th><th>Faltan</th></tr></thead>
            <tbody>
              {s.trialsEnding.map((t) => (
                <tr key={t.organizationId}>
                  <td><Link to={`/platform/orgs/${t.organizationId}`}><strong>{t.name}</strong></Link></td>
                  <td>{t.planName}</td>
                  <td className="mono">{fmtDate(t.trialEndsAt)}</td>
                  <td><span className={`badge ${t.daysLeft <= 1 ? 'badge-danger' : 'badge-muted'}`}>{t.daysLeft} {t.daysLeft === 1 ? 'día' : 'días'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-container" style={{ marginBottom: 16 }}>
        <div className="table-header"><h2>En gracia (solo lectura)</h2></div>
        {s.inGrace.length === 0 ? <div className="loading-state">Ninguna empresa en gracia</div> : (
          <table>
            <thead><tr><th>Empresa</th><th>Plan</th><th>Gracia termina</th></tr></thead>
            <tbody>
              {s.inGrace.map((g) => (
                <tr key={g.organizationId}>
                  <td><Link to={`/platform/orgs/${g.organizationId}`}><strong>{g.name}</strong></Link></td>
                  <td>{g.planName}</td>
                  <td className="mono">{fmtDate(g.graceEndsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-container" style={{ padding: 20 }}>
        <div className="table-header" style={{ padding: 0, marginBottom: 8 }}><h2>Suscripciones vigentes por plan</h2></div>
        {Object.keys(s.plans).length === 0 ? <p>Sin suscripciones vigentes.</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {Object.entries(s.plans).map(([code, n]) => <li key={code}><strong>{code}</strong> · {n}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}
