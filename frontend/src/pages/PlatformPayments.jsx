import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, fmt, fmtDate } from '../api';
import Pagination from '../components/ui/Pagination';
import { useDebounce } from '../hooks/useDebounce';

const PAGE_SIZE = 15;
const STATUS_LABELS = { PAID: 'Pagado', PENDING: 'Pendiente', EXPIRED: 'Vencido', FAILED: 'Fallido' };

/** PlatformPayments — Cobros de todas las empresas, con filtros y totales de lo pagado dentro del filtro. */
export default function PlatformPayments({ showToast }) {
  const [data, setData] = useState({ page: { content: [], page: 0, totalElements: 0, totalPages: 0 }, totals: null });
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await API.platform.payments({ page, size: PAGE_SIZE, status, search: debouncedSearch.trim(), from, to });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando los cobros: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [page, status, debouncedSearch, from, to]);

  const reset = (setter) => (e) => { setter(e.target.value); setPage(0); };
  const { content, totalElements, totalPages } = data.page;
  const t = data.totals;

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>Cobros</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Buscar empresa, NIT o correo..." value={search} onChange={reset(setSearch)} style={{ width: 230 }} />
          <select aria-label="Filtrar por estado" value={status} onChange={reset(setStatus)} style={{ width: 140 }}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label style={{ fontSize: '.8rem' }}>Desde <input type="date" aria-label="Desde" value={from} onChange={reset(setFrom)} /></label>
          <label style={{ fontSize: '.8rem' }}>Hasta <input type="date" aria-label="Hasta" value={to} onChange={reset(setTo)} /></label>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{totalElements} cobros</span>
        </div>
      </div>

      {t && (
        <p className="payments-totals" style={{ padding: '0 20px 12px', color: 'var(--text-muted)', fontSize: '.85rem' }}>
          Pagado en este filtro ({t.paidCount}): total <strong>{fmt(t.paidTotal)}</strong> · neto {fmt(t.paidNet)} · IVA {fmt(t.paidIva)}
        </p>
      )}

      {content.length === 0 ? <div className="loading-state">Sin cobros con estos filtros</div> : (
        <table>
          <thead><tr><th>Fecha</th><th>Empresa</th><th>Plan</th><th>Ciclo</th><th>Neto</th><th>IVA</th><th>Total</th><th>Estado</th><th>Origen</th></tr></thead>
          <tbody>
            {content.map((p) => (
              <tr key={p.id}>
                <td className="mono">{fmtDate(p.paidAt || p.createdAt)}</td>
                <td><Link to={`/platform/orgs/${p.organizationId}`}>{p.organizationName || `#${p.organizationId}`}</Link></td>
                <td>{p.planName}</td>
                <td>{p.billingCycle === 'YEARLY' ? 'Anual' : 'Mensual'}</td>
                <td className="mono">{fmt(p.amountNet)}</td>
                <td className="mono">{fmt(p.ivaAmount)}</td>
                <td className="mono"><strong>{fmt(p.amountTotal)}</strong></td>
                <td><span className={`badge ${p.status === 'PAID' ? 'badge-success' : p.status === 'PENDING' ? 'badge-muted' : 'badge-danger'}`}>{STATUS_LABELS[p.status]}</span></td>
                <td>{p.provider === 'MANUAL' ? 'Manual' : p.createdByPlatform ? 'Enlace de plataforma' : 'La empresa'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={data.page.page} totalPages={totalPages} totalElements={totalElements} onPage={setPage} />
    </div>
  );
}
