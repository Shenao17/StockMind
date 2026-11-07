import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../api';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import PinConfirm from '../components/PinConfirm';
import { useAuth } from '../context/AuthContext';
import { REQUEST_STATUS, REQUEST_TYPES, describeParams } from '../platformRoles';

const PAGE_SIZE = 15;

/**
 * PlatformRequests — Solicitudes de acciones sensibles.
 * El dueño ve todas y las aprueba (PIN) o rechaza (con nota); el resto ve las suyas y puede cancelarlas.
 */
export default function PlatformRequests({ showToast }) {
  const { user } = useAuth() || {};
  const reviewer = (user?.permissions || []).includes('REQUEST_REVIEW');

  const [data, setData] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('PENDING');
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState('');
  const [rejectError, setRejectError] = useState('');

  // Tras decidir o cancelar, la barra del panel actualiza su contador de pendientes
  const reload = () => {
    setReloadKey((k) => k + 1);
    window.dispatchEvent(new Event('platform:requests-changed'));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await API.platform.requests({ page, size: PAGE_SIZE, status });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando las solicitudes: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [page, status, reloadKey]);

  async function approve(pin) {
    try {
      await API.platform.approveRequest(approving.id, pin);
      showToast?.('Solicitud aprobada y ejecutada');
      setApproving(null);
      reload();
    } catch (e) {
      if (e.code === 'PIN_INVALID') throw e;       // PinConfirm lo muestra y deja reintentar
      setApproving(null);
      showToast?.('No se pudo ejecutar: ' + e.message, 'error');
    }
  }

  async function reject() {
    if (note.trim().length < 5) { setRejectError('Explica por qué se rechaza (mínimo 5 caracteres)'); return; }
    try {
      await API.platform.rejectRequest(rejecting.id, note.trim());
      showToast?.('Solicitud rechazada');
      setRejecting(null); setNote(''); setRejectError('');
      reload();
    } catch (e) {
      setRejectError(e.message);
    }
  }

  async function cancel(r) {
    if (!confirm('¿Cancelar esta solicitud?')) return;
    try {
      await API.platform.cancelRequest(r.id);
      showToast?.('Solicitud cancelada');
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>{reviewer ? 'Solicitudes del equipo' : 'Mis solicitudes'}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select aria-label="Filtrar por estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} style={{ width: 160 }}>
            <option value="">Todas</option>
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((k) => <option key={k} value={k}>{REQUEST_STATUS[k]}</option>)}
          </select>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{data.totalElements} solicitudes</span>
        </div>
      </div>

      {data.content.length === 0 ? <div className="loading-state">{status === 'PENDING' ? 'No hay solicitudes pendientes' : 'Sin solicitudes'}</div> : (
        <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Fecha</th><th>Empresa</th><th>Acción</th><th>Detalle</th><th>Motivo</th><th>Pidió</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {data.content.map((r) => (
              <tr key={r.id}>
                <td className="mono">{new Date(r.createdAt).toLocaleString('es-CO')}</td>
                <td><Link to={`/platform/orgs/${r.organizationId}`}>{r.organizationName || `#${r.organizationId}`}</Link></td>
                <td><strong>{REQUEST_TYPES[r.type] || r.type}</strong></td>
                <td>{describeParams(r.type, r.params)}</td>
                <td style={{ minWidth: 200, maxWidth: 280, fontSize: '.85rem' }}>{r.reason}</td>
                <td className="mono">{r.requestedBy}</td>
                <td>
                  <span className={`badge ${r.status === 'APPROVED' ? 'badge-success' : r.status === 'PENDING' ? 'badge-accent' : 'badge-muted'}`}>{REQUEST_STATUS[r.status]}</span>
                  {r.decidedBy && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>por {r.decidedBy}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</div>}
                </td>
                <td>
                  {r.status === 'PENDING' && reviewer && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setApproving(r)}>Aprobar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { setRejecting(r); setNote(''); setRejectError(''); }}>Rechazar</button>
                    </div>
                  )}
                  {r.status === 'PENDING' && !reviewer && r.requestedBy === user?.email && (
                    <button className="btn btn-ghost btn-sm" onClick={() => cancel(r)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} />

      <PinConfirm open={!!approving} title={approving ? `Aprobar: ${REQUEST_TYPES[approving.type]} — ${approving.organizationName}` : ''}
        onConfirm={approve} onCancel={() => setApproving(null)} />

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Rechazar solicitud"
        footer={<><button className="btn btn-ghost" onClick={() => setRejecting(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={reject}>Rechazar</button></>}>
        {rejectError && <div className="login-error visible"><span className="login-error-icon">!</span><span>{rejectError}</span></div>}
        <div className="form-group"><label htmlFor="rej-note">Motivo del rechazo (lo verá quien la pidió)</label>
          <textarea id="rej-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </Modal>
    </div>
  );
}
