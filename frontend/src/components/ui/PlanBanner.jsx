import { Link } from 'react-router-dom';
import { useSubscription } from '../../context/subscriptionState';
import { fmtDate } from '../../api';

/**
 * PlanBanner — Aviso del estado del plan: prueba por terminar, plan vencido (solo lectura) o
 * renovación cercana. No se muestra si todo está en orden ni en cuentas de cortesía.
 */
export default function PlanBanner() {
  const { subscription: s } = useSubscription();
  if (!s || s.complimentary) return null;

  let tone = null;
  let text = null;

  if (s.status === 'TRIAL' && s.trialDaysLeft != null) {
    const d = s.trialDaysLeft;
    tone = d <= 5 ? 'warning' : 'info';
    text = d === 0
      ? 'Tu prueba gratis termina hoy.'
      : `Prueba gratis: te ${d === 1 ? 'queda 1 día' : `quedan ${d} días`}.`;
    if (d <= 5) text += ' Elige un plan para no perder el acceso.';
  } else if (s.status === 'GRACE') {
    tone = 'danger';
    text = `Tu plan venció: StockMind está en modo solo lectura${s.graceEndsAt ? ` hasta el ${fmtDate(s.graceEndsAt)}` : ''}. Renueva para hacer cambios.`;
  } else if (s.status === 'ACTIVE' && s.currentPeriodEnd) {
    const days = Math.ceil((new Date(s.currentPeriodEnd) - new Date()) / 86400000);
    if (days <= 5 && days >= 0) {
      tone = 'warning';
      text = days === 0 ? 'Tu plan vence hoy.' : `Tu plan vence en ${days} ${days === 1 ? 'día' : 'días'}.`;
    }
  }

  if (!text) return null;

  return (
    <div className={`plan-banner plan-banner-${tone}`} role="status">
      <span>{text}</span>
      <Link to="/billing" className="btn btn-primary btn-sm">Ver planes</Link>
    </div>
  );
}
