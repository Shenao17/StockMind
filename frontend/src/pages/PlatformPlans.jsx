import { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import Modal from '../components/ui/Modal';
import PinConfirm from '../components/PinConfirm';

const FEATURES = { REPORTS: 'Reportes', PREDICTIONS: 'Predicciones', EXPORT: 'Exportar', AI_ASSISTANT: 'Asistente IA', API: 'API' };
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

      <Modal open={!!editing && !pinFor} onClose={() => setEditing(null)} title={editing ? `Editar plan ${editing.code}` : ''}
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" onClick={review}>Continuar</button></>}>
        {editing && (
          <>
            {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}
            {editing.subscribers > 0 && (
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                {editing.subscribers} empresa(s) usan este plan: los límites y funciones nuevos les aplican de inmediato; el precio, solo a los cobros nuevos.
              </p>
            )}
            <div className="form-group"><label htmlFor="pl-name">Nombre</label><input id="pl-name" value={editing.name} onChange={set('name')} /></div>
            <div className="form-group"><label htmlFor="pl-m">Precio mensual (sin IVA)</label><input id="pl-m" type="number" value={editing.priceMonthly} onChange={set('priceMonthly')} /></div>
            <div className="form-group"><label htmlFor="pl-y">Precio anual (sin IVA)</label><input id="pl-y" type="number" value={editing.priceYearly} onChange={set('priceYearly')} /></div>
            <div className="form-group"><label htmlFor="pl-u">Usuarios incluidos</label><input id="pl-u" type="number" value={editing.maxUsers} onChange={set('maxUsers')} /></div>
            <div className="form-group"><label htmlFor="pl-p">Productos activos</label><input id="pl-p" type="number" value={editing.maxProducts} onChange={set('maxProducts')} /></div>
            <div className="form-group"><label htmlFor="pl-x">Usuario adicional (sin IVA/mes)</label><input id="pl-x" type="number" value={editing.extraUserPrice} onChange={set('extraUserPrice')} /></div>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend style={{ fontSize: '.85rem', marginBottom: 6 }}>Funciones incluidas</legend>
              {Object.entries(FEATURES).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={editing.features.includes(k)} onChange={() => toggleFeature(k)} /> {label}
                </label>
              ))}
            </fieldset>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo (visible para contratar)
            </label>
          </>
        )}
      </Modal>

      <PinConfirm open={pinFor} title="Confirma el cambio con tu PIN" onConfirm={save} onCancel={() => setPinFor(false)} />
    </>
  );
}
