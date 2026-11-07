import { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import Modal from '../components/ui/Modal';
import PinConfirm from '../components/PinConfirm';

const FEATURES = { REPORTS: 'Reportes', PREDICTIONS: 'Predicciones', EXPORT: 'Exportar', AI_ASSISTANT: 'Asistente IA', API: 'API' };
// Descripción y estado de cada función: no se debe prometer lo que aún no existe
const FEATURE_INFO = {
  REPORTS: { desc: 'Ventas por periodo y productos más vendidos', ready: true },
  PREDICTIONS: { desc: 'Demanda esperada y recomendaciones de compra', ready: true },
  EXPORT: { desc: 'Descargar datos en Excel o PDF', ready: false },
  AI_ASSISTANT: { desc: 'Asistente con inteligencia artificial', ready: false },
  API: { desc: 'Integraciones con otros sistemas', ready: false },
};
const NUM = ['priceMonthly', 'priceYearly', 'maxUsers', 'maxProducts', 'extraUserPrice'];

/**
 * PlatformPlans — Editor de planes, precios y límites (solo el dueño, con su PIN).
 * Los límites y funciones aplican de inmediato a las empresas que usan el plan; los precios, a los cobros nuevos.
 */
export default function PlatformPlans({ showToast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null);     // formulario
  const [pinFor, setPinFor] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await API.platform.plans();
        if (!cancelled) setPlans(list);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando los planes: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [reloadKey]);

  const set = (k) => (e) => setEditing((p) => ({ ...p, [k]: e.target.value }));
  const toggleFeature = (f) => setEditing((p) => ({
    ...p, features: p.features.includes(f) ? p.features.filter((x) => x !== f) : [...p.features, f],
  }));

  function start(p) {
    setError('');
    setEditing({ code: p.code, name: p.name, priceMonthly: String(p.priceMonthly), priceYearly: String(p.priceYearly),
      maxUsers: String(p.maxUsers), maxProducts: String(p.maxProducts), extraUserPrice: String(p.extraUserPrice),
      active: p.active, features: [...p.features], subscribers: p.subscribers });
  }

  function review() {
    for (const k of NUM) {
      if (editing[k] === '' || Number.isNaN(Number(editing[k]))) { setError('Revisa los números: hay un campo vacío o inválido'); return; }
    }
    setError('');
    setPinFor(true);
  }

  async function save(pin) {
    const body = { name: editing.name.trim(), active: editing.active, features: editing.features, pin };
    NUM.forEach((k) => { body[k] = Number(editing[k]); });
    try {
      await API.platform.updatePlan(editing.code, body);
      showToast?.('Plan actualizado');
      setPinFor(false); setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (e.code === 'PIN_INVALID') throw e;
      setPinFor(false);
      setError(e.message);                           // se muestra en el formulario para corregir
    }
  }

  // Ayuda en vivo: cuánto ahorra quien paga el año completo frente a 12 meses
  let savings = null;
  if (editing) {
    const m = Number(editing.priceMonthly);
    const y = Number(editing.priceYearly);
    if (m > 0 && y > 0) {
      if (y > m * 12) savings = { cls: 'warn', text: 'El anual no puede superar 12 meses del mensual.' };
      else {
        const saved = m * 12 - y;
        const months = Math.round((saved / m) * 10) / 10;
        savings = { cls: saved > 0 ? 'ok' : '', text: saved > 0 ? `Ahorro de ${fmt(saved)} al año (≈ ${months} meses gratis)` : 'Sin descuento frente a pagar 12 meses.' };
      }
    }
  }

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <>
      <div className="table-container">
        <div className="table-header"><h2>Planes y precios</h2>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Precios en COP sin IVA</span></div>
        <table>
          <thead><tr><th>Plan</th><th>Mensual</th><th>Anual</th><th>Usuarios</th><th>Productos</th><th>Usuario extra</th><th>Funciones</th><th>Empresas</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.code}>
                <td><strong>{p.name}</strong><div className="mono" style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{p.code}</div></td>
                <td className="mono">{fmt(p.priceMonthly)}</td>
                <td className="mono">{fmt(p.priceYearly)}</td>
                <td className="mono">{p.maxUsers}</td>
                <td className="mono">{p.maxProducts}</td>
                <td className="mono">{fmt(p.extraUserPrice)}</td>
                <td style={{ fontSize: '.8rem' }}>{p.features.length ? p.features.map((f) => FEATURES[f] || f).join(', ') : '—'}</td>
                <td className="mono">{p.subscribers}</td>
                <td><span className={`badge ${p.active ? 'badge-success' : 'badge-muted'}`}>{p.active ? 'Activo' : 'Inactivo'}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => start(p)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing && !pinFor} size="wide" onClose={() => setEditing(null)} title={editing ? `Editar plan ${editing.name || editing.code}` : ''}
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" onClick={review}>Continuar</button></>}>
        {editing && (
          <>
            {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}
            {editing.subscribers > 0 && (
              <div className="notice">
                <strong>{editing.subscribers} empresa(s) usan este plan.</strong> Los límites y las funciones nuevos les aplican de inmediato;
                el precio nuevo solo a los cobros que se generen desde ahora.
              </div>
            )}

            <div className="form-group"><label htmlFor="pl-name">Nombre del plan</label>
              <input id="pl-name" value={editing.name} onChange={set('name')} /></div>

            <div className="form-section"><h4>Precios</h4><p>En pesos colombianos, sin IVA (el IVA se suma al cobrar).</p></div>
            <div className="form-row">
              <div className="form-group"><label htmlFor="pl-m">Mensual</label>
                <input id="pl-m" type="number" min="0" value={editing.priceMonthly} onChange={set('priceMonthly')} /></div>
              <div className="form-group"><label htmlFor="pl-y">Anual</label>
                <input id="pl-y" type="number" min="0" value={editing.priceYearly} onChange={set('priceYearly')} />
                {savings && <p className={`field-hint ${savings.cls}`}>{savings.text}</p>}</div>
            </div>

            <div className="form-section"><h4>Límites</h4><p>Reducir un límite no borra nada: solo impide agregar más.</p></div>
            <div className="form-row cols-3">
              <div className="form-group"><label htmlFor="pl-u">Usuarios incluidos</label>
                <input id="pl-u" type="number" min="1" value={editing.maxUsers} onChange={set('maxUsers')} /></div>
              <div className="form-group"><label htmlFor="pl-p">Productos activos</label>
                <input id="pl-p" type="number" min="1" value={editing.maxProducts} onChange={set('maxProducts')} /></div>
              <div className="form-group"><label htmlFor="pl-x">Usuario adicional</label>
                <input id="pl-x" type="number" min="0" value={editing.extraUserPrice} onChange={set('extraUserPrice')} />
                <p className="field-hint">precio por mes, sin IVA</p></div>
            </div>

            <div className="form-section"><h4>Funciones incluidas</h4><p>Marca lo que recibe quien contrata este plan.</p></div>
            <div className="check-grid" role="group" aria-label="Funciones incluidas">
              {Object.entries(FEATURES).map(([k, label]) => (
                <label key={k} className="check-row">
                  <input type="checkbox" aria-label={label} checked={editing.features.includes(k)} onChange={() => toggleFeature(k)} />
                  <span className="check-text">
                    <span className="check-title">{label}</span>
                    <span className="check-desc">{FEATURE_INFO[k].desc}</span>
                  </span>
                  {!FEATURE_INFO[k].ready && <span className="check-tag">Próximamente</span>}
                </label>
              ))}
            </div>
            {editing.features.some((f) => !FEATURE_INFO[f].ready) && (
              <p className="field-hint warn">Algunas funciones marcadas aún no están construidas: quien contrate el plan no las tendrá hasta que existan.</p>
            )}

            <div className="form-section"><h4>Disponibilidad</h4></div>
            <label className="check-row">
              <input type="checkbox" className="switch" aria-label="Activo" checked={editing.active}
                onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} />
              <span className="check-text">
                <span className="check-title">{editing.active ? 'Plan activo' : 'Plan inactivo'}</span>
                <span className="check-desc">{editing.active ? 'Se puede contratar desde la web y el panel.' : 'No se muestra para contratar; las empresas que ya lo tienen lo conservan.'}</span>
              </span>
            </label>
          </>
        )}
      </Modal>

      <PinConfirm open={pinFor} title="Confirma el cambio con tu PIN" onConfirm={save} onCancel={() => setPinFor(false)} />
    </>
  );
}
