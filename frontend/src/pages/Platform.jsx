import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import PlatformTeam from './PlatformTeam';

const PAGE_SIZE = 10;

const STATUS_LABELS = { PENDING: 'Sin verificar', ACTIVE: 'Activa', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada' };
const SUB_LABELS = { TRIAL: 'Prueba', ACTIVE: 'Activo', GRACE: 'Gracia', SUSPENDED: 'Suspendido', CANCELLED: 'Cancelado' };

// perm = permiso que concede el rol (el backend lo vuelve a exigir; aquí solo se oculta lo que no aplica)
const ACTIONS = [
  { value: 'extend-trial', label: 'Extender prueba', perm: 'TRIAL_EXTEND' },
  { value: 'plan', label: 'Cambiar plan', perm: 'SENSITIVE' },
  { value: 'payment-links', label: 'Generar enlace de pago', perm: 'PAYMENT_LINK' },
  { value: 'manual-payment', label: 'Registrar pago recibido', perm: 'SENSITIVE' },
  { value: 'suspend', label: 'Suspender', perm: 'SENSITIVE' },
  { value: 'reactivate', label: 'Reactivar', perm: 'ORG_REACTIVATE' },
  { value: 'cancel', label: 'Cancelar', perm: 'SENSITIVE' },
];

const emptyCompany = {
  companyName: '', taxId: '', phone: '', adminEmail: '', password: '',
  planCode: 'PRO', mode: 'TRIAL', billingCycle: 'MONTHLY',
};

/** Platform — Panel del equipo de plataforma: empresas, planes y cobros (y el equipo, para el dueño). */
export default function Platform({ showToast }) {
  const { user } = useAuth() || {};
  const perms = user?.permissions || [];
  const can = (p) => perms.includes(p);
  const allowedActions = ACTIONS.filter((a) => can(a.perm));
  const [tab, setTab] = useState('companies');
  const [data, setData] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [company, setCompany] = useState(emptyCompany);
  const [action, setAction] = useState(null);   // { org, type }
  const [actionForm, setActionForm] = useState({ days: 7, planCode: 'PRO', billingCycle: 'MONTHLY' });
  const [link, setLink] = useState(null);

  const debouncedSearch = useDebounce(search, 300);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => { API.public.plans().then(setPlans).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await API.platform.organizations({
          page, size: PAGE_SIZE, search: debouncedSearch.trim(), status: statusFilter,
        });
        if (cancelled) return;
        if (res.content.length === 0 && page > 0) { setPage(page - 1); return; }
        setData(res);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando empresas: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [page, debouncedSearch, statusFilter, reloadKey]);

  const f = (setter) => (k) => (e) => setter((prev) => ({ ...prev, [k]: e.target.value }));

  async function saveCompany() {
    try {
      await API.platform.create(company);
      showToast?.('Empresa creada');
      setCreating(false);
      setCompany(emptyCompany);
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  function startAction(org, type) {
    if (!type) return;
    if (['suspend', 'reactivate', 'cancel'].includes(type)) {
      const label = ACTIONS.find((a) => a.value === type).label.toLowerCase();
      if (!confirm(`¿Confirmas ${label} a "${org.name}"?`)) return;
      run(org, type, {});
      return;
    }
    setActionForm({ days: 7, planCode: org.subscription?.planCode || 'PRO', billingCycle: org.subscription?.billingCycle || 'MONTHLY' });
    setAction({ org, type });
  }

  async function run(org, type, body) {
    try {
      const res = await API.platform.action(org.id, type, body);
      if (type === 'payment-links') setLink(res.checkoutUrl);
      else showToast?.('Hecho');
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function submitAction() {
    const { org, type } = action;
    const body = type === 'extend-trial'
      ? { days: Number(actionForm.days) }
      : { planCode: actionForm.planCode, billingCycle: actionForm.billingCycle };
    setAction(null);
    await run(org, type, body);
  }

  const orgs = data.content;
  const expiry = (s) => (s ? fmtDate(s.status === 'TRIAL' ? s.trialEndsAt : s.currentPeriodEnd || s.graceEndsAt) : '—');

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <>
      {can('TEAM_MANAGE') && (
        <div className="platform-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'companies'} className="btn btn-ghost btn-sm" onClick={() => setTab('companies')}>Empresas</button>
          <button role="tab" aria-selected={tab === 'team'} className="btn btn-ghost btn-sm" onClick={() => setTab('team')}>Equipo</button>
        </div>
      )}
      {tab === 'team' && can('TEAM_MANAGE') ? <PlatformTeam showToast={showToast} /> : (<>
      <div className="table-container">
        <div className="table-header">
          <h2>Empresas</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="text" placeholder="Buscar por nombre, NIT o correo..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ width: 260 }} />
            <select aria-label="Filtrar por estado" value={statusFilter} style={{ width: 150 }}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{data.totalElements} empresas</span>
            {can('ORG_CREATE') && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Nueva empresa</button>}
          </div>
        </div>

        {orgs.length === 0 ? (
          <div className="loading-state">{debouncedSearch || statusFilter ? 'Sin resultados' : 'Aún no hay empresas'}</div>
        ) : (
          <table>
            <thead>
              <tr><th>Empresa</th><th>Estado</th><th>Plan</th><th>Vence</th><th>Origen</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/platform/orgs/${o.id}`} className="company-link"><strong>{o.name}</strong></Link><div className="mono" style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{o.taxId || '—'} · {o.contactEmail}</div></td>
                  <td><span className={`badge ${o.status === 'ACTIVE' ? 'badge-success' : o.status === 'PENDING' ? 'badge-muted' : 'badge-danger'}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td>{o.subscription ? `${o.subscription.planName} · ${SUB_LABELS[o.subscription.status]}${o.subscription.complimentary ? ' (cortesía)' : ''}` : '—'}</td>
                  <td className="mono">{expiry(o.subscription)}</td>
                  <td>{o.origin === 'SELF_SIGNUP' ? 'Autoregistro' : 'Plataforma'}</td>
                  <td>
                    {allowedActions.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Solo consulta</span>
                    ) : (
                      <select aria-label={`Acción para ${o.name}`} value="" onChange={(e) => startAction(o, e.target.value)} style={{ width: 170 }}>
                        <option value="">Acciones…</option>
                        {allowedActions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} />
      </div>

      {/* Nueva empresa */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva empresa"
        footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button><button className="btn btn-primary" onClick={saveCompany}>Crear</button></>}>
        <div className="form-group"><label>Nombre de la empresa *</label><input value={company.companyName} onChange={f(setCompany)('companyName')} /></div>
        <div className="form-group"><label>NIT *</label><input value={company.taxId} onChange={f(setCompany)('taxId')} placeholder="900123456-7" /></div>
        <div className="form-group"><label>Teléfono</label><input value={company.phone} onChange={f(setCompany)('phone')} /></div>
        <div className="form-group"><label>Correo del administrador *</label><input type="email" value={company.adminEmail} onChange={f(setCompany)('adminEmail')} /></div>
        <div className="form-group"><label>Contraseña inicial *</label><input type="password" value={company.password} onChange={f(setCompany)('password')} autoComplete="new-password" /></div>
        <div className="form-group"><label>Plan</label>
          <select value={company.planCode} onChange={f(setCompany)('planCode')}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </div>
        <div className="form-group"><label>Condición</label>
          <select value={company.mode} onChange={f(setCompany)('mode')}>
            <option value="TRIAL">Prueba gratis de 14 días</option>
            <option value="PAID">Pago ya recibido</option>
            <option value="COMPLIMENTARY">Cortesía (sin cobro)</option>
          </select>
        </div>
        {company.mode === 'PAID' && (
          <div className="form-group"><label>Ciclo pagado</label>
            <select value={company.billingCycle} onChange={f(setCompany)('billingCycle')}><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select>
          </div>
        )}
      </Modal>

      {/* Acciones con parámetros */}
      <Modal open={!!action} onClose={() => setAction(null)} title={action ? `${ACTIONS.find((a) => a.value === action.type)?.label} — ${action.org.name}` : ''}
        footer={<><button className="btn btn-ghost" onClick={() => setAction(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitAction}>Aceptar</button></>}>
        {action?.type === 'extend-trial' ? (
          <div className="form-group"><label>Días a sumar (1–{can('SENSITIVE') ? 90 : 7})</label><input type="number" min="1" max={can('SENSITIVE') ? 90 : 7} value={actionForm.days} onChange={f(setActionForm)('days')} /></div>
        ) : (
          <>
            <div className="form-group"><label>Plan</label>
              <select value={actionForm.planCode} onChange={f(setActionForm)('planCode')}>
                {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — {fmt(p.totalMonthly)}/mes con IVA</option>)}
              </select>
            </div>
            <div className="form-group"><label>Ciclo</label>
              <select value={actionForm.billingCycle} onChange={f(setActionForm)('billingCycle')}><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select>
            </div>
          </>
        )}
      </Modal>

      {/* Enlace de pago generado */}
      <Modal open={!!link} onClose={() => setLink(null)} title="Enlace de pago"
        footer={<button className="btn btn-primary" onClick={() => setLink(null)}>Cerrar</button>}>
        <p>Envía este enlace al cliente. Vence en 48 horas.</p>
        <input readOnly value={link || ''} onFocus={(e) => e.target.select()} aria-label="Enlace de pago" />
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => { navigator.clipboard?.writeText(link); showToast?.('Enlace copiado'); }}>Copiar</button>
      </Modal>
      </>)}
    </>
  );
}
