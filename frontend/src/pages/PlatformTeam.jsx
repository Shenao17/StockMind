import { useEffect, useState } from 'react';
import { API, fmtDate } from '../api';
import Modal from '../components/ui/Modal';
import { PLATFORM_ROLE_LABELS, TEAM_ASSIGNABLE_ROLES } from '../platformRoles';

const emptyMember = { fullName: '', email: '', role: 'PLATFORM_SUPPORT' };

/**
 * PlatformTeam — Gestión del equipo de plataforma (solo el dueño). Toda acción pide el PIN del dueño.
 * La contraseña temporal de un alta o reinicio se muestra una sola vez.
 */
export default function PlatformTeam({ showToast }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [member, setMember] = useState(emptyMember);
  const [pending, setPending] = useState(null);   // { kind, target, body } a la espera del PIN
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [temp, setTemp] = useState(null);         // { email, password }

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await API.platform.team.list();
        if (!cancelled) setMembers(list);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando el equipo: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [reloadKey]);

  function ask(kind, target, body) {
    setPin(''); setPinError('');
    setPending({ kind, target, body });
  }

  async function confirm() {
    if (!pin) { setPinError('Escribe tu PIN'); return; }
    const { kind, target, body } = pending;
    try {
      if (kind === 'create') {
        const res = await API.platform.team.create({ ...body, pin });
        setTemp({ email: res.member.email, password: res.temporaryPassword });
        setCreating(false); setMember(emptyMember);
      } else if (kind === 'reset') {
        const res = await API.platform.team.resetAccess(target.id, pin);
        setTemp({ email: res.member.email, password: res.temporaryPassword });
      } else {
        await API.platform.team.update(target.id, { ...body, pin });
        showToast?.('Cambio guardado');
      }
      setPending(null);
      load();
    } catch (e) {
      if (e.code === 'PIN_INVALID') { setPinError(e.message); return; }   // el PIN se vuelve a pedir
      setPending(null);
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const setField = (k) => (e) => setMember((m) => ({ ...m, [k]: e.target.value }));

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h2>Equipo de la plataforma</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Agregar miembro</button>
        </div>
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>2FA</th><th>Alta</th><th>Acciones</th></tr></thead>
          <tbody>
            {members.map((m) => {
              const isOwner = m.role === 'PLATFORM_OWNER';
              return (
                <tr key={m.id}>
                  <td><strong>{m.fullName || '—'}</strong><div className="mono" style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{m.email}</div></td>
                  <td>
                    {isOwner ? PLATFORM_ROLE_LABELS[m.role] : (
                      <select aria-label={`Rol de ${m.email}`} value={m.role}
                        onChange={(e) => ask('update', m, { role: e.target.value })}>
                        {TEAM_ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABELS[r]}</option>)}
                      </select>
                    )}
                  </td>
                  <td><span className={`badge ${m.active ? 'badge-success' : 'badge-danger'}`}>{m.active ? 'Activo' : 'Desactivado'}</span></td>
                  <td>{m.mfaEnabled ? 'Configurado' : 'Pendiente'}</td>
                  <td className="mono">{fmtDate(m.createdAt)}</td>
                  <td>
                    {isOwner ? <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>—</span> : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => ask('update', m, { active: !m.active })}>
                          {m.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => ask('reset', m)}>Reiniciar acceso</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Alta */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Agregar miembro"
        footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => ask('create', null, member)}>Continuar</button></>}>
        <div className="form-group"><label>Nombre completo *</label><input value={member.fullName} onChange={setField('fullName')} /></div>
        <div className="form-group"><label>Correo *</label><input type="email" value={member.email} onChange={setField('email')} /></div>
        <div className="form-group"><label>Rol</label>
          <select value={member.role} onChange={setField('role')}>
            {TEAM_ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
          Recibirá una contraseña temporal. En su primer ingreso deberá cambiarla y configurar su app autenticadora y su PIN.
        </p>
      </Modal>

      {/* Confirmación con PIN */}
      <Modal open={!!pending} onClose={() => setPending(null)} title="Confirma con tu PIN"
        footer={<><button className="btn btn-ghost" onClick={() => setPending(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm}>Confirmar</button></>}>
        {pinError && <div className="login-error visible"><span className="login-error-icon">!</span><span>{pinError}</span></div>}
        <div className="form-group"><label htmlFor="owner-pin">PIN</label>
          <input id="owner-pin" type="password" inputMode="numeric" maxLength={10} autoComplete="off" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && confirm()} />
        </div>
      </Modal>

      {/* Contraseña temporal (una sola vez) */}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Contraseña temporal"
        footer={<button className="btn btn-primary" onClick={() => setTemp(null)}>Ya la copié</button>}>
        <p>Entrégasela a <strong>{temp?.email}</strong> por un canal seguro. <strong>No se volverá a mostrar.</strong></p>
        <div className="team-temp-password mono" data-testid="temp-password">{temp?.password}</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => { navigator.clipboard?.writeText(temp.password); showToast?.('Contraseña copiada'); }}>Copiar</button>
      </Modal>
    </>
  );
}
