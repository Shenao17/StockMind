import { useEffect, useRef, useState } from 'react';

const MAX_DELAY = 60;

/**
 * ErrorState — Cuando un servicio no responde: mensaje claro, botón "Reintentar" y reintento
 * automático con espera creciente (10 s, 20 s, 40 s, 60 s…). Solo ocupa la zona afectada.
 * `onRetry` puede devolver una promesa; mientras se resuelve se muestra "Reintentando…".
 */
export default function ErrorState({ title = 'No pudimos cargar esta información', message = 'El servicio no respondió. Tus datos están a salvo; revisa tu conexión e inténtalo de nuevo.', onRetry, auto = true }) {
  const [retrying, setRetrying] = useState(false);
  const [delay, setDelay] = useState(10);
  const [left, setLeft] = useState(10);
  const retryRef = useRef(onRetry);
  const alive = useRef(true);
  useEffect(() => { retryRef.current = onRetry; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = async () => {
    if (!retryRef.current) return;
    setRetrying(true);
    try { await retryRef.current(); } catch { /* la pantalla decide qué mostrar */ }
    if (alive.current) {
      const next = Math.min(delay * 2, MAX_DELAY);
      setDelay(next); setLeft(next); setRetrying(false);
    }
  };
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; });

  // Cuenta regresiva hasta el siguiente reintento automático
  useEffect(() => {
    if (!auto || !onRetry || retrying) return undefined;
    const t = setInterval(() => setLeft((l) => Math.max(l - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [auto, onRetry, retrying]);
  useEffect(() => { if (left === 0 && auto && onRetry && !retrying) runRef.current(); }, [left, auto, onRetry, retrying]);

  return (
    <div className={`err-state${retrying ? ' retrying' : ''}`} role="alert">
      <div className="err-ill" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>
      </div>
      <strong>{title}</strong>
      <p>{message}</p>
      {onRetry && (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={retrying}>
            {retrying && <span className="err-spin" aria-hidden="true" />}
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
          {auto && !retrying && <span className="err-auto">Reintento automático en {Math.max(left, 0)} s</span>}
        </>
      )}
    </div>
  );
}
