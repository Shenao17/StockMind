import { useEffect, useState } from 'react';
import { API } from '../api';
import Modal from './ui/Modal';
import { REQUEST_TYPES } from '../platformRoles';

/**
 * RequestModal — Pedir al dueño una acción sensible sobre una empresa (con motivo).
 * El dueño la aprueba (con su PIN) o la rechaza desde la pantalla Solicitudes.
 */
export default function RequestModal({ open, org, initialType = 'SUSPEND', onClose, onCreated, showToast }) {
  const [type, setType] = useState(initialType);
  const [planCode, setPlanCode] = useState('PRO');
  const [cycle, setCycle] = useState('MONTHLY');
  const [days, setDays] = useState(30);
  const [taxId, setTaxId] = useState('');
  const [complimentary, setComplimentary] = useState(false);
  const [reason, setReason] = useState('');
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Cada vez que se abre (o cambia la empresa/tipo) el formulario parte limpio. Se hace durante el render
  // (patrón recomendado por React) y no en un efecto, para no provocar renderizados en cascada.
  const openKey = open ? `${org?.id}:${initialType}` : null;
  const [lastKey, setLastKey] = useState(null);
  if (openKey !== lastKey) {
    setLastKey(openKey);
    if (openKey) {
      setType(initialType); setReason(''); setError(''); setTaxId(''); setComplimentary(false); setDays(30);
      setPlanCode(org?.subscription?.planCode || 'PRO'); setCycle(org?.subscription?.billingCycle || 'MONTHLY');
    }
  }

  useEffect(() => {
    if (open) API.public.plans().then(setPlans).catch(() => {});
  }, [open]);

  async function submit() {
    if (reason.trim().length < 10) { setError('Explica el motivo (mínimo 10 caracteres)'); return; }
    const params = {
      SUSPEND: {}, CANCEL: {},
      CHANGE_PLAN: { planCode, billingCycle: cycle, complimentary },
      MANUAL_PAYMENT: { planCode, billingCycle: cycle },
      EXTEND_TRIAL: { days: Number(days) },
      CHANGE_TAX_ID: { taxId: taxId.trim() },
    }[type];
    setBusy(true); setError('');
    try {
      await API.platform.createRequest({ type, organizationId: org.id, reason: reason.trim(), params });
      showToast?.('Solicitud enviada al dueño');
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  const needsPlan = type === 'CHANGE_PLAN' || type === 'MANUAL_PAYMENT';

  return (
    <Modal open={open} onClose={onClose} title={`Solicitar acción — ${org?.name || ''}`}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>Enviar solicitud</button></>}>
      {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}
      <div className="form-group"><label htmlFor="rq-type">Acción</label>
        <select id="rq-type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(REQUEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {needsPlan && (
        <>
          <div className="form-group"><label htmlFor="rq-plan">Plan</label>
            <select id="rq-plan" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select></div>
          <div className="form-group"><label htmlFor="rq-cycle">Ciclo</label>
            <select id="rq-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></div>
        </>
      )}
      {type === 'CHANGE_PLAN' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input type="checkbox" checked={complimentary} onChange={(e) => setComplimentary(e.target.checked)} /> Cortesía (sin cobro)
        </label>
      )}
      {type === 'EXTEND_TRIAL' && (
        <div className="form-group"><label htmlFor="rq-days">Días a sumar (1–90)</label>
          <input id="rq-days" type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} /></div>
      )}
      {type === 'CHANGE_TAX_ID' && (
        <div className="form-group"><label htmlFor="rq-tax">Nuevo NIT</label>
          <input id="rq-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="900123456-7" /></div>
      )}

      <div className="form-group"><label htmlFor="rq-reason">Motivo (el dueño lo verá al decidir)</label>
        <textarea id="rq-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: el cliente lo pidió por teléfono y confirmó su identidad" /></div>
    </Modal>
  );
}
