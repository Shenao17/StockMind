import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';
import Modal from '../components/ui/Modal';
import PinConfirm from '../components/PinConfirm';
import { useAuth } from '../context/AuthContext';
import { AUDIT_LABELS } from '../platformRoles';
import RequestModal from '../components/RequestModal';

const STATUS_LABELS = { PENDING: 'Sin verificar', ACTIVE: 'Activa', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada' };
const SUB_LABELS = { TRIAL: 'Prueba', ACTIVE: 'Activo', GRACE: 'Gracia', SUSPENDED: 'Suspendido', CANCELLED: 'Cancelado' };
const PAY_LABELS = { PENDING: 'Pendiente', PAID: 'Pagado', FAILED: 'Fallido', EXPIRED: 'Vencido' };
const FEATURE_LABELS = { REPORTS: 'Reportes', PREDICTIONS: 'Predicciones', EXPORT: 'Exportar', AI_ASSISTANT: 'Asistente IA', API: 'API' };
const ROLE_LABELS = { ADMIN: 'Administrador', SELLER: 'Vendedor' };

/** Barra de uso frente al límite del plan. */
function Usage({ label, used, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
        <span>{label}</span><span className="mono">{used} / {max}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={max}
        style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pct >= 90 ? 'var(--danger, #e5484d)' : 'var(--accent, #6c8cff)' }} />
      </div>
    </div>
  );
}

/** PlatformCompany — Ficha de una empresa: datos, plan y uso, usuarios, cobros y línea de tiempo. */
export default function PlatformCompany({ showToast }) {
  const { id } = useParams();
  const { user } = useAuth() || {};
  const can = (p) => (user?.permissions || []).includes(p);

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null);       // formulario de contacto
  const [taxModal, setTaxModal] = useState(null);     // { taxId } → luego pide PIN
  const [pinFor, setPinFor] = useState(null);         // { kind: 'tax'|'mfa', ... }
  const [requesting, setRequesting] = useState(false);

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await API.platform.detail(id);
        if (!cancelled) { setDetail(d); setError(''); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  if (error) return <div className="loading-state">{error} · <Link to="/platform/companies">Volver</Link></div>;
  if (!detail) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  const org = detail.organization;
  const plan = detail.plan;
  const f = (k) => (e) => setEditing((p) => ({ ...p, [k]: e.target.value }));

  function startEdit() {
    setEditing({ name: org.name || '', legalName: org.legalName || '', phone: org.phone || '',
      contactEmail: org.contactEmail || '', country: org.country || 'CO' });
  }

  async function saveContact() {
    // Solo se envía lo que cambió
    const orig = { name: org.name || '', legalName: org.legalName || '', phone: org.phone || '',
      contactEmail: org.contactEmail || '', country: org.country || 'CO' };
    const body = Object.fromEntries(Object.entries(editing).filter(([k, v]) => v.trim() !== orig[k]).map(([k, v]) => [k, v.trim()]));
    if (Object.keys(body).length === 0) { showToast?.('No hay cambios que guardar', 'error'); return; }
    try {
      await API.platform.updateContact(id, body);
      showToast?.('Datos actualizados');
      setEditing(null);
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function confirmPin(pin) {
    try {
      if (pinFor.kind === 'tax') {
        await API.platform.updateTaxId(id, pinFor.taxId, pin);
        showToast?.('NIT actualizado');
        setTaxModal(null);
      } else {
        await API.platform.resetUserMfa(id, pinFor.user.id, pin);
        showToast?.('Verificación en dos pasos reiniciada');
      }
      setPinFor(null);
      reload();
    } catch (e) {
      if (e.code === 'PIN_INVALID') throw e;
      setPinFor(null);
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const expiry = plan?.status === 'TRIAL' ? plan.trialEndsAt : plan?.currentPeriodEnd || plan?.graceEndsAt;

  return (
    <>
      <p style={{ marginBottom: 12 }}><Link to="/platform/companies">← Empresas</Link></p>

      <div className="table-container" style={{ padding: 20, marginBottom: 16 }}>
        <div className="table-header" style={{ padding: 0, marginBottom: 12 }}>
          <div>
            <h2>{org.name}</h2>
            <div className="mono" style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {org.taxId || 'Sin NIT'} · {org.origin === 'SELF_SIGNUP' ? 'Autoregistro' : 'Creada por la plataforma'} · desde {fmtDate(org.createdAt)}
            </div>
          </div>
          <span className={`badge ${org.status === 'ACTIVE' ? 'badge-success' : org.status === 'PENDING' ? 'badge-muted' : 'badge-danger'}`}>
            {STATUS_LABELS[org.status]}
          </span>
        </div>

        <dl className="company-data">
          <div><dt>Razón social</dt><dd>{org.legalName || '—'}</dd></div>
          <div><dt>Correo de contacto</dt><dd>{org.contactEmail}</dd></div>
          <div><dt>Teléfono</dt><dd>{org.phone || '—'}</dd></div>
          <div><dt>País</dt><dd>{org.country}</dd></div>
          <div><dt>2FA</dt><dd>{detail.requireMfa ? 'Exigido a todos los usuarios' : 'Opcional'}</dd></div>
          <div><dt>Términos</dt><dd>{detail.termsAcceptedAt ? `Aceptados ${fmtDate(detail.termsAcceptedAt)}` : '—'}</dd></div>
        </dl>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {can('ORG_EDIT_CONTACT') && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Corregir datos</button>}
          {can('SENSITIVE') && <button className="btn btn-ghost btn-sm" onClick={() => setTaxModal({ taxId: org.taxId || '' })}>Corregir NIT</button>}
          {can('REQUEST_CREATE') && !can('SENSITIVE') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setRequesting(true)}>Solicitar acción…</button>
          )}
        </div>
      </div>

      <div className="table-container" style={{ padding: 20, marginBottom: 16 }}>
        <div className="table-header" style={{ padding: 0, marginBottom: 12 }}><h2>Plan y uso</h2></div>
        {!plan ? <p>Esta empresa no tiene suscripción.</p> : (
          <>
            <p>
              <strong>{plan.planName}</strong> · {SUB_LABELS[plan.status]}{plan.complimentary ? ' (cortesía)' : ''}
              {' · '}{plan.billingCycle === 'YEARLY' ? 'anual' : 'mensual'}
              {expiry && <> · vence <span className="mono">{fmtDate(expiry)}</span></>}
              {plan.status === 'TRIAL' && plan.trialDaysLeft != null && <> ({plan.trialDaysLeft} días)</>}
            </p>
            <Usage label="Usuarios activos" used={plan.usage.users} max={plan.maxUsers} />
            <Usage label="Productos activos" used={plan.usage.products} max={plan.maxProducts} />
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
              Incluye: {plan.features.length ? plan.features.map((x) => FEATURE_LABELS[x] || x).join(', ') : 'funciones básicas'}
            </p>
          </>
        )}
      </div>

      <div className="table-container" style={{ marginBottom: 16 }}>
        <div className="table-header"><h2>Usuarios ({detail.users.length})</h2></div>
        <table>
          <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>2FA</th><th>Acciones</th></tr></thead>
          <tbody>
            {detail.users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td className="mono">{u.email}</td>
                <td>{ROLE_LABELS[u.role] || u.role}</td>
                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                <td><span className={`badge ${u.mfaEnabled ? 'badge-success' : 'badge-muted'}`}>{u.mfaEnabled ? 'Activa' : 'No'}</span></td>
                <td>
                  {can('SENSITIVE') && u.mfaEnabled && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPinFor({ kind: 'mfa', user: u })}>Reiniciar 2FA</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-container" style={{ marginBottom: 16 }}>
        <div className="table-header"><h2>Cobros</h2></div>
        {!detail.paymentsVisible ? (
          <div className="loading-state">Tu rol no incluye ver los cobros.</div>
        ) : detail.payments.length === 0 ? (
          <div className="loading-state">Sin cobros todavía</div>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Plan</th><th>Ciclo</th><th>Neto</th><th>IVA</th><th>Total</th><th>Estado</th><th>Origen</th></tr></thead>
            <tbody>
              {detail.payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{fmtDate(p.paidAt || p.createdAt)}</td>
                  <td>{p.planName}</td>
                  <td>{p.billingCycle === 'YEARLY' ? 'Anual' : 'Mensual'}</td>
                  <td className="mono">{fmt(p.amountNet)}</td>
                  <td className="mono">{fmt(p.ivaAmount)}</td>
                  <td className="mono"><strong>{fmt(p.amountTotal)}</strong></td>
                  <td><span className={`badge ${p.status === 'PAID' ? 'badge-success' : p.status === 'PENDING' ? 'badge-muted' : 'badge-danger'}`}>{PAY_LABELS[p.status]}</span></td>
                  <td>{p.provider === 'MANUAL' ? 'Manual' : p.createdByPlatform ? 'Enlace de plataforma' : 'La empresa'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-container" style={{ padding: 20 }}>
        <div className="table-header" style={{ padding: 0, marginBottom: 12 }}><h2>Línea de tiempo</h2></div>
        <ol className="timeline" aria-label="Línea de tiempo">
          {detail.timeline.map((e, i) => (
            <li key={i}>
              <span className="mono timeline-date">{new Date(e.at).toLocaleString('es-CO')}</span>
              <span className="timeline-title">{e.type === 'AUDIT' ? (AUDIT_LABELS[e.title] || e.title) : e.title}</span>
              {(e.actor || e.details) && <span className="timeline-detail">{[e.actor && `por ${e.actor}`, e.details].filter(Boolean).join(' · ')}</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* Corregir datos */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Corregir datos de contacto"
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveContact}>Guardar</button></>}>
        {editing && (
          <>
            <div className="form-group"><label htmlFor="c-name">Nombre de la empresa</label><input id="c-name" value={editing.name} onChange={f('name')} /></div>
            <div className="form-group"><label htmlFor="c-legal">Razón social</label><input id="c-legal" value={editing.legalName} onChange={f('legalName')} /></div>
            <div className="form-group"><label htmlFor="c-phone">Teléfono</label><input id="c-phone" value={editing.phone} onChange={f('phone')} /></div>
            <div className="form-group"><label htmlFor="c-email">Correo de contacto</label><input id="c-email" type="email" value={editing.contactEmail} onChange={f('contactEmail')} /></div>
            <div className="form-group"><label htmlFor="c-country">País (2 letras)</label><input id="c-country" maxLength={2} value={editing.country} onChange={f('country')} /></div>
          </>
        )}
      </Modal>

      {/* NIT */}
      <Modal open={!!taxModal && !pinFor} onClose={() => setTaxModal(null)} title="Corregir NIT"
        footer={<><button className="btn btn-ghost" onClick={() => setTaxModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => setPinFor({ kind: 'tax', taxId: taxModal.taxId.trim() })}>Continuar</button></>}>
        {taxModal && (
          <>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>El NIT no se puede repetir entre empresas. Verifica el documento antes de cambiarlo: queda auditado.</p>
            <div className="form-group"><label htmlFor="c-tax">NIT</label>
              <input id="c-tax" value={taxModal.taxId} onChange={(e) => setTaxModal({ taxId: e.target.value })} placeholder="900123456-7" /></div>
          </>
        )}
      </Modal>

      <RequestModal open={requesting} org={{ id: org.id, name: org.name, subscription: plan }} onClose={() => setRequesting(false)} showToast={showToast} />

      <PinConfirm open={!!pinFor} onConfirm={confirmPin} onCancel={() => setPinFor(null)} />
    </>
  );
}
