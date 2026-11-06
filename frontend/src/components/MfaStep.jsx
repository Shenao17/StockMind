import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { API } from '../api';

/**
 * MfaStep — Segundo paso del inicio de sesión del equipo de plataforma.
 *
 *  - challenge.mfaRequired: pide el código de la app autenticadora (o un código de respaldo).
 *  - challenge.enrollmentRequired: primer acceso. Configura la app (QR), un PIN de confirmación y,
 *    si la contraseña era temporal, la nueva contraseña; al final muestra los códigos de respaldo
 *    UNA sola vez.
 *
 * onDone(user) recibe el usuario cuando la sesión ya quedó abierta (cookie httpOnly puesta por el gateway).
 */
export default function MfaStep({ challenge, onDone, onCancel }) {
  return challenge.enrollmentRequired
    ? <Enroll challenge={challenge} onDone={onDone} onCancel={onCancel} />
    : <Verify challenge={challenge} onDone={onDone} onCancel={onCancel} />;
}

function Verify({ challenge, onDone, onCancel }) {
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim()) { setError('Escribe el código'); return; }
    setBusy(true); setError('');
    try {
      const res = await API.auth.mfaVerify({ challengeToken: challenge.token, code: code.trim() });
      onDone(res.user);
    } catch (e) {
      setError(e.message || 'Código incorrecto');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-card">
      <div className="login-card-header">
        <span className="login-eyebrow">Verificación en dos pasos</span>
        <h2>{challenge.fullName ? `Hola, ${challenge.fullName}` : 'Confirma que eres tú'}</h2>
        <p>{useBackup ? 'Escribe uno de tus códigos de respaldo.' : 'Abre tu app autenticadora y escribe el código de 6 dígitos.'}</p>
      </div>
      {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}
      <div className="form-group login-field">
        <label htmlFor="mfa-code">{useBackup ? 'Código de respaldo' : 'Código'}</label>
        <div className="login-input-wrapper">
          <input id="mfa-code" inputMode={useBackup ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus
            maxLength={useBackup ? 12 : 6} value={code}
            onChange={(e) => setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
      <button className="login-submit" onClick={submit} disabled={busy}>
        {busy ? 'Verificando...' : <><span>Verificar</span><span className="login-submit-arrow">→</span></>}
      </button>
      <div className="login-footer">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setUseBackup(!useBackup); setCode(''); setError(''); }}>
          {useBackup ? 'Usar la app' : 'Usar un código de respaldo'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Volver</button>
      </div>
    </div>
  );
}

function Enroll({ challenge, onDone, onCancel }) {
  const [setup, setSetup] = useState(null);       // { secret, otpauthUri }
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);         // { user, backupCodes }

  useEffect(() => {
    let cancelled = false;
    API.auth.enrollStart({ challengeToken: challenge.token })
      .then(async (res) => {
        if (cancelled) return;
        setSetup(res);
        try { setQr(await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 192 })); } catch { /* queda la clave manual */ }
      })
      .catch((e) => !cancelled && setError(e.message || 'No se pudo iniciar la configuración'));
    return () => { cancelled = true; };
  }, [challenge.token]);

  async function submit() {
    if (challenge.mustChangePassword) {
      if (password !== password2) { setError('Las contraseñas no coinciden'); return; }
    }
    if (challenge.pinRequired) {
      if (!/^\d{6,10}$/.test(pin)) { setError('El PIN debe tener entre 6 y 10 dígitos'); return; }
      if (pin !== pin2) { setError('Los PIN no coinciden'); return; }
    }
    if (!/^\d{6}$/.test(code)) { setError('Escribe el código de 6 dígitos de la app'); return; }
    setBusy(true); setError('');
    try {
      const res = await API.auth.enrollFinish({
        challengeToken: challenge.token, code,
        ...(challenge.pinRequired ? { pin } : {}),
        ...(challenge.mustChangePassword ? { newPassword: password } : {}),
      });
      setDone({ user: res.user, backupCodes: res.backupCodes || [] });
    } catch (e) {
      setError(e.message || 'No se pudo completar la configuración');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="login-card">
        <div className="login-card-header">
          <span className="login-eyebrow">Configuración lista</span>
          <h2>Guarda tus códigos de respaldo</h2>
          <p>Cada código sirve una sola vez si pierdes el celular. No se volverán a mostrar.</p>
        </div>
        <ul className="backup-codes" aria-label="Códigos de respaldo">
          {done.backupCodes.map((c) => <li key={c} className="mono">{c}</li>)}
        </ul>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}
          onClick={() => navigator.clipboard?.writeText(done.backupCodes.join('\n'))}>Copiar</button>
        <button className="login-submit" onClick={() => onDone(done.user)}>
          <span>Ya los guardé</span><span className="login-submit-arrow">→</span>
        </button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-card-header">
        <span className="login-eyebrow">{challenge.pinRequired ? 'Primer acceso' : 'Seguridad de la empresa'}</span>
        <h2>Protege tu cuenta</h2>
        <p>{challenge.pinRequired
          ? 'Configura tu app autenticadora y un PIN. Lo haces una sola vez.'
          : 'Tu empresa exige la verificación en dos pasos. Configura tu app autenticadora; lo haces una sola vez.'}</p>
      </div>
      {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}

      {challenge.mustChangePassword && (
        <>
          <div className="form-group login-field">
            <label htmlFor="new-password">Contraseña nueva</label>
            <div className="login-input-wrapper"><input id="new-password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          <div className="form-group login-field">
            <label htmlFor="new-password2">Repite la contraseña</label>
            <div className="login-input-wrapper"><input id="new-password2" type="password" autoComplete="new-password"
              value={password2} onChange={(e) => setPassword2(e.target.value)} /></div>
          </div>
        </>
      )}

      <div className="mfa-setup">
        <p><strong>1.</strong> Escanea el QR con Google Authenticator, Microsoft Authenticator o Aegis.</p>
        {qr && <img src={qr} alt="Código QR para la app autenticadora" width="192" height="192" />}
        {setup && (
          <p className="mfa-secret">¿No puedes escanear? Escribe esta clave: <span className="mono" data-testid="mfa-secret">{setup.secret}</span></p>
        )}
        <p><strong>2.</strong> Escribe el código de 6 dígitos que muestra la app.</p>
      </div>

      <div className="form-group login-field">
        <label htmlFor="enroll-code">Código de la app</label>
        <div className="login-input-wrapper"><input id="enroll-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      {challenge.pinRequired && (
        <>
          <div className="form-group login-field">
            <label htmlFor="enroll-pin">PIN de confirmación (6 a 10 dígitos)</label>
            <div className="login-input-wrapper"><input id="enroll-pin" type="password" inputMode="numeric" maxLength={10} autoComplete="off"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <div className="form-group login-field">
            <label htmlFor="enroll-pin2">Repite el PIN</label>
            <div className="login-input-wrapper"><input id="enroll-pin2" type="password" inputMode="numeric" maxLength={10} autoComplete="off"
              value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
        </>
      )}

      <button className="login-submit" onClick={submit} disabled={busy || !setup}>
        {busy ? 'Guardando...' : <><span>Terminar configuración</span><span className="login-submit-arrow">→</span></>}
      </button>
      <div className="login-footer">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Volver</button>
      </div>
    </div>
  );
}
