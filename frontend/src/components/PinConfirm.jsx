import { useState } from 'react';
import Modal from './ui/Modal';

/**
 * PinConfirm — Pide el PIN del miembro del equipo para confirmar una acción sensible.
 * onConfirm(pin) debe lanzar el error si falla; un PIN incorrecto (code PIN_INVALID) se muestra aquí
 * y el cuadro sigue abierto para reintentar; cualquier otro error lo maneja quien llama.
 */
export default function PinConfirm({ open, title = 'Confirma con tu PIN', onConfirm, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!pin) { setError('Escribe tu PIN'); return; }
    setBusy(true); setError('');
    try {
      await onConfirm(pin);
      setPin('');
    } catch (e) {
      if (e.code === 'PIN_INVALID') setError(e.message);
      else { setPin(''); throw e; }
    } finally { setBusy(false); }
  }

  function cancel() { setPin(''); setError(''); onCancel(); }

  return (
    <Modal open={open} onClose={cancel} title={title}
      footer={<><button className="btn btn-ghost" onClick={cancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirm} disabled={busy}>Confirmar</button></>}>
      {error && <div className="login-error visible"><span className="login-error-icon">!</span><span>{error}</span></div>}
      <div className="form-group"><label htmlFor="pin-confirm">PIN</label>
        <input id="pin-confirm" type="password" inputMode="numeric" maxLength={10} autoComplete="off" autoFocus value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && confirm()} />
      </div>
    </Modal>
  );
}
