import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../api';
import Pagination from '../components/ui/Pagination';
import { useDebounce } from '../hooks/useDebounce';
import { AUDIT_LABELS } from '../platformRoles';

const PAGE_SIZE = 20;

/** PlatformAudit — Quién hizo qué y cuándo (acciones del equipo y cambios de seguridad de las empresas). */
export default function PlatformAudit({ showToast }) {
  const [data, setData] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const debouncedActor = useDebounce(actor, 300);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await API.platform.audit({ page, size: PAGE_SIZE, action, actor: debouncedActor.trim(), from, to });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando la auditoría: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [page, action, debouncedActor, from, to]);

  const reset = (setter) => (e) => { setter(e.target.value); setPage(0); };

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>Auditoría</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Filtrar por acción" value={action} onChange={reset(setAction)} style={{ width: 230 }}>
            <option value="">Todas las acciones</option>
            {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" placeholder="Quién (correo)..." value={actor} onChange={reset(setActor)} style={{ width: 180 }} />
          <label style={{ fontSize: '.8rem' }}>Desde <input type="date" aria-label="Desde" value={from} onChange={reset(setFrom)} /></label>
          <label style={{ fontSize: '.8rem' }}>Hasta <input type="date" aria-label="Hasta" value={to} onChange={reset(setTo)} /></label>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{data.totalElements} registros</span>
        </div>
      </div>

      {data.content.length === 0 ? <div className="loading-state">Sin registros con estos filtros</div> : (
        <table>
          <thead><tr><th>Fecha</th><th>Acción</th><th>Quién</th><th>Empresa</th><th>Detalle</th></tr></thead>
          <tbody>
            {data.content.map((a) => (
              <tr key={a.id}>
                <td className="mono">{new Date(a.at).toLocaleString('es-CO')}</td>
                <td>{AUDIT_LABELS[a.action] || a.action}</td>
                <td className="mono">{a.actor}</td>
                <td>{a.organizationId ? <Link to={`/platform/orgs/${a.organizationId}`}>{a.organizationName || `#${a.organizationId}`}</Link> : '—'}</td>
                <td style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{a.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} />
    </div>
  );
}
