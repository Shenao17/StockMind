import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';

/**
 * Security — Seguridad de la cuenta: verificación en dos pasos (app autenticadora) del propio usuario y,
 * para el administrador, la opción de exigirla a toda la empresa.
 * Activar y desactivar piden la contraseña actual (y desactivar, además un código).
 */
export default function Security({ showToast }) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState(null);       // { enabled, requiredByCompany, canDisable, backupCodesLeft }
  const [reloadKey, setReloadKey] = useState(0);
  const [step, setStep] = useState('idle');         // idle | password | scan | codes | disable
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [backup, setBackup] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(null);       // admin: ¿la empresa la exige?

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await API.mfa.status();
        if (!cancelled) setStatus(s);
        if (isAdmin()) {
          const p = await API.users.mfaPolicy();
          if (!cancelled) setPolicy(p.required);
        }
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando la seguridad: ' + e.message, 'error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [reloadKey]);

  function reset(next = 'idle') {
    setStep(next); setPassword(''); setCode(''); setError(''); setSetup(null); setQr('');
  }

  async function start() {
    if (!password) { setError('Escribe tu contraseña'); return; }
    setBusy(true); setError('');
    try {
      const res = await API.mfa.setupStart(password);
      setSetup(res);
      try { setQr(await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 192 })); } catch { /* queda la clave manual */ }
      setPassword('');
      setStep('scan');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!/^\d{6}$/.test(code)) { setError('Escribe el código de 6 dígitos de la app'); return; }
    setBusy(true); setError('');
    try {
      const res = await API.mfa.setupFinish(code);
      setBackup(res.backupCodes || []);
      reset('codes');
      reload();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function disable() {
    if (!password || !code.trim()) { setError('Escribe tu contraseña y un código'); return; }
    setBusy(true); setError('');
    try {
      await API.mfa.disable(password, code.trim());
      showToast?.('Verificación en dos pasos desactivada');
      reset();
      reload();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function togglePolicy() {
    const next = !policy;
    if (next && !confirm('A partir de su próximo inicio de sesión, todos los usuarios de la empresa deberán configurar la verificación en dos pasos. ¿Continuar?')) return;
    try {
      const res = await API.users.setMfaPolicy(next);
      setPolicy(res.required);
      showToast?.(res.required ? 'Ahora la empresa exige la verificación en dos pasos' : 'La verificación en dos pasos vuelve a ser opcional');
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  if (!status) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <div className="security-page">
      <div className="table-container" style={{ padding: 20 }}>
        <div className="table-header" style={{ padding: 0, marginBottom: 12 }}>
          <h2>Verificación en dos pasos</h2>
          <span className={`badge ${status.enabled ? 'badge-success' : 'badge-muted'}`}>{status.enabled ? 'Activada' : 'Desactivada'}</span>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 14 }}>
          Además de tu contraseña, te pediremos un código de 6 dígitos de una app autenticadora (Google Authenticator,
          Microsoft Authenticator, Aegis…). Así, aunque alguien conozca tu contraseña, no podrá entrar.
        </p>
        {status.requiredByCompany && <p className="badge badge-accent" style={{ marginBottom: 12 }}>Tu empresa exige la verificación en dos pasos.</p>}

        {error && <div className="login-error visible" style={{ marginBottom: 12 }}><span className="login-error-icon">!</span><span>{error}</span></div>}

        {step === 'idle' && !status.enabled && (
          <button className="btn btn-primary" onClick={() => reset('password')}>Activar</button>
        )}
        {step === 'idle' && status.enabled && (
          <>
            <p>Te quedan <strong>{status.backupCodesLeft}</strong> códigos de respaldo sin usar.</p>
            {status.canDisable
              ? <button className="btn btn-danger btn-sm" style={{ marginTop: 8 }} onClick={() => reset('disable')}>Desactivar</button>
              : <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>No se puede desactivar mientras la empresa la exija.</p>}
          </>
        )}

        {step === 'password' && (
          <div style={{ maxWidth: 360 }}>
            <div className="form-group"><label htmlFor="sec-password">Confirma tu contraseña</label>
              <input id="sec-password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} /></div>
            <button className="btn btn-primary" onClick={start} disabled={busy}>Continuar</button>
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => reset()}>Cancelar</button>
          </div>
        )}

        {step === 'scan' && setup && (
          <div className="mfa-setup" style={{ maxWidth: 360 }}>
            <p><strong>1.</strong> Escanea el QR con tu app autenticadora.</p>
            {qr && <img src={qr} alt="Código QR para la app autenticadora" width="192" height="192" />}
            <p className="mfa-secret">¿No puedes escanear? Escribe esta clave: <span className="mono" data-testid="mfa-secret">{setup.secret}</span></p>
            <p><strong>2.</strong> Escribe el código de 6 dígitos que muestra la app.</p>
            <div className="form-group"><label htmlFor="sec-code">Código de la app</label>
              <input id="sec-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && finish()} /></div>
            <button className="btn btn-primary" onClick={finish} disabled={busy}>Activar</button>
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => reset()}>Cancelar</button>
          </div>
        )}

        {step === 'codes' && (
          <div style={{ maxWidth: 360 }}>
            <p><strong>Listo, quedó activada.</strong> Guarda estos códigos de respaldo: cada uno sirve una sola vez si pierdes el celular. No se volverán a mostrar.</p>
            <ul className="backup-codes" aria-label="Códigos de respaldo">
              {backup.map((c) => <li key={c} className="mono">{c}</li>)}
            </ul>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(backup.join('\n'))}>Copiar</button>
            <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => { setBackup([]); reset(); }}>Ya los guardé</button>
          </div>
        )}

        {step === 'disable' && (
          <div style={{ maxWidth: 360 }}>
            <div className="form-group"><label htmlFor="sec-password">Tu contraseña</label>
              <input id="sec-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="form-group"><label htmlFor="sec-code">Código de la app (o de respaldo)</label>
              <input id="sec-code" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <button className="btn btn-danger" onClick={disable} disabled={busy}>Desactivar</button>
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => reset()}>Cancelar</button>
          </div>
        )}
      </div>

      {isAdmin() && policy !== null && (
        <div className="table-container" style={{ padding: 20, marginTop: 16 }}>
          <div className="table-header" style={{ padding: 0, marginBottom: 12 }}>
            <h2>Política de la empresa</h2>
            <span className={`badge ${policy ? 'badge-success' : 'badge-muted'}`}>{policy ? 'Obligatoria' : 'Opcional'}</span>
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            Exige la verificación en dos pasos a todos los usuarios. Quien aún no la tenga la configurará en su próximo inicio de sesión.
            Si alguien pierde su celular, puedes reiniciarle la verificación desde <strong>Usuarios</strong>.
          </p>
          <button className="btn btn-ghost" onClick={togglePolicy}>{policy ? 'Volver a hacerla opcional' : 'Exigirla a todos'}</button>
        </div>
      )}
    </div>
  );
}
