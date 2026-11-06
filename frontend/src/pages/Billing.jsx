import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/subscriptionState';

const STATUS_LABELS = {
  TRIAL: 'Prueba gratis',
  ACTIVE: 'Activo',
  GRACE: 'Vencido (solo lectura)',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado',
};

const FEATURE_LABELS = {
  REPORTS: 'Reportes de ventas',
  PREDICTIONS: 'Predicción de demanda',
  EXPORT: 'Exportación a Excel/PDF (próximamente)',
  AI_ASSISTANT: 'Asistente con IA (próximamente)',
  API: 'Integraciones / API (próximamente)',
};

function Usage({ label, used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="usage">
      <div className="usage-head"><span>{label}</span><strong>{used} / {max}</strong></div>
      <div className="usage-bar"><div className={`usage-fill${pct >= 90 ? ' full' : ''}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Billing — Plan actual, uso, planes disponibles (con IVA) y historial de cobros. */
export default function Billing({ showToast }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { subscription: sub } = useSubscription();
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cycle, setCycle] = useState('MONTHLY');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    API.billing.plans().then(setPlans).catch((e) => showToast?.('Error cargando planes: ' + e.message, 'error'));
    if (isAdmin()) API.billing.payments().then(setPayments).catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function choose(plan) {
    setBusy(plan.code);
    try {
      const payment = await API.billing.checkout({ planCode: plan.code, billingCycle: cycle });
      const url = new URL(payment.checkoutUrl, window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname);
      else window.location.assign(payment.checkoutUrl);
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {sub && (
        <div className="table-container" style={{ marginBottom: 16 }}>
          <div className="table-header">
            <h2>Tu plan</h2>
            <span className={`badge ${sub.status === 'ACTIVE' || sub.status === 'TRIAL' ? 'badge-success' : 'badge-danger'}`}>
              {STATUS_LABELS[sub.status] || sub.status}
            </span>
          </div>
          <div className="plan-current">
            <div>
              <div className="plan-current-name">{sub.planName}{sub.complimentary ? ' · cortesía' : ''}</div>
              {sub.status === 'TRIAL' && sub.trialEndsAt && (
                <div className="plan-current-sub">La prueba termina el {fmtDate(sub.trialEndsAt)}{sub.trialDaysLeft != null ? ` (${sub.trialDaysLeft} días)` : ''}</div>
              )}
              {sub.status === 'ACTIVE' && sub.currentPeriodEnd && !sub.complimentary && (
                <div className="plan-current-sub">Vigente hasta el {fmtDate(sub.currentPeriodEnd)}</div>
              )}
              {sub.status === 'GRACE' && sub.graceEndsAt && (
                <div className="plan-current-sub">Solo lectura hasta el {fmtDate(sub.graceEndsAt)}</div>
              )}
              {sub.blocked && <div className="plan-current-sub">Tu cuenta está suspendida. Elige un plan para recuperar el acceso.</div>}
            </div>
            <div className="plan-usage">
              <Usage label="Usuarios activos" used={sub.usage.users} max={sub.maxUsers} />
              <Usage label="Productos activos" used={sub.usage.products} max={sub.maxProducts} />
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <h2>Planes</h2>
          <div className="cycle-toggle" role="group" aria-label="Ciclo de cobro">
            <button className={`btn btn-sm ${cycle === 'MONTHLY' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCycle('MONTHLY')}>Mensual</button>
            <button className={`btn btn-sm ${cycle === 'YEARLY' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCycle('YEARLY')}>Anual · 2 meses gratis</button>
          </div>
        </div>

        <div className="plans-grid">
          {plans.map((p) => {
            const yearly = cycle === 'YEARLY';
            const net = yearly ? p.priceYearly : p.priceMonthly;
            const iva = yearly ? p.ivaYearly : p.ivaMonthly;
            const total = yearly ? p.totalYearly : p.totalMonthly;
            const current = sub?.planCode === p.code && sub?.status === 'ACTIVE';
            return (
              <div key={p.code} className={`plan-card${sub?.planCode === p.code ? ' current' : ''}`}>
                <h3>{p.name}</h3>
                <div className="plan-price">{fmt(net)}<span>{yearly ? ' / año' : ' / mes'}</span></div>
                <div className="plan-tax">+ IVA {fmt(iva)} = <strong>{fmt(total)}</strong></div>
                <ul className="plan-list">
                  <li>{p.maxUsers} usuarios</li>
                  <li>{p.maxProducts.toLocaleString('es-CO')} productos</li>
                  <li>Inventario, ventas y dashboard</li>
                  {p.features.map((f) => <li key={f}>{FEATURE_LABELS[f] || f}</li>)}
                </ul>
                {isAdmin() ? (
                  <button className="btn btn-primary" disabled={busy === p.code} onClick={() => choose(p)}>
                    {busy === p.code ? 'Preparando...' : current ? 'Renovar' : 'Elegir plan'}
                  </button>
                ) : (
                  <span className="plan-note">Solo un administrador puede cambiar el plan</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="plan-footnote">Los precios no incluyen IVA (19 %); el total lo muestra cada plan.</div>
      </div>

      {isAdmin() && payments.length > 0 && (
        <div className="table-container" style={{ marginTop: 16 }}>
          <div className="table-header"><h2>Historial de cobros</h2></div>
          <table>
            <thead><tr><th>Fecha</th><th>Plan</th><th>Ciclo</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.reference}>
                  <td className="mono">{fmtDate(p.paidAt || p.expiresAt)}</td>
                  <td>{p.planName}</td>
                  <td>{p.billingCycle === 'YEARLY' ? 'Anual' : 'Mensual'}</td>
                  <td className="mono">{fmt(p.amountTotal)}</td>
                  <td><span className={`badge ${p.status === 'PAID' ? 'badge-success' : 'badge-muted'}`}>{p.status === 'PAID' ? 'Pagado' : p.status === 'PENDING' ? 'Pendiente' : 'Vencido'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
