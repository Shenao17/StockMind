import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API, fmt } from '../api';

/**
 * Pay — Página pública de pago (/pay/:reference). Es el destino del enlace que recibe el cliente.
 * Con la pasarela SIMULADA muestra un botón de prueba; con una pasarela real este paso lo hace la pasarela.
 */
export default function Pay() {
  const { reference } = useParams();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    API.public.payment(reference).then(setPayment).catch((e) => setError(e.message || 'No se encontró el pago.'));
  }, [reference]);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      setPayment(await API.public.simulatePayment(reference));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const status = payment?.status;

  return (
    <div className="login-wrapper">
      <div className="login-orb login-orb-one"></div>
      <div className="login-orb login-orb-two"></div>
      <div className="login-content">
        <div className="login-brand"><h1>StockMind</h1><p>Pago de tu plan</p></div>

        <div className="login-card">
          {!payment && !error && <p>Cargando...</p>}
          {error && <div className="login-error visible" role="alert"><span className="login-error-icon">!</span><span>{error}</span></div>}

          {payment && (
            <>
              <div className="login-card-header">
                <span className="login-eyebrow">{payment.company}</span>
                <h2>Plan {payment.planName} · {payment.billingCycle === 'YEARLY' ? 'anual' : 'mensual'}</h2>
              </div>

              <table className="pay-summary">
                <tbody>
                  <tr><td>Plan (sin IVA)</td><td className="mono">{fmt(payment.amountNet)}</td></tr>
                  <tr><td>IVA</td><td className="mono">{fmt(payment.ivaAmount)}</td></tr>
                  <tr className="pay-total"><td>Total a pagar</td><td className="mono">{fmt(payment.amountTotal)}</td></tr>
                </tbody>
              </table>

              {status === 'PAID' && (
                <>
                  <p role="status"><strong>Pago recibido.</strong> Tu plan ya está activo.</p>
                  <Link className="login-submit" to="/" style={{ textAlign: 'center', textDecoration: 'none' }}>Ir a StockMind</Link>
                </>
              )}
              {status === 'EXPIRED' && <p role="alert">Este enlace de pago venció. Pide uno nuevo desde StockMind o a tu asesor.</p>}
              {status === 'PENDING' && payment.canSimulate && (
                <>
                  <p className="plan-note">Pasarela de pruebas: no se cobra dinero real.</p>
                  <button className="login-submit" onClick={pay} disabled={busy}>{busy ? 'Procesando...' : 'Simular pago exitoso'}</button>
                </>
              )}
              {status === 'PENDING' && !payment.canSimulate && <p>Estamos esperando la confirmación del pago.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
