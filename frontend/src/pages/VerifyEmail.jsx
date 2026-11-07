import BrandLogo from '../components/ui/BrandLogo';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API } from '../api';

/**
 * VerifyEmail — Destino del enlace del correo de verificación (/verify-email?token=...).
 * Consume el token una sola vez; si el enlace ya se usó o venció, lo indica con un mensaje claro.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');

  // 'loading' | 'ok' | 'error'; sin token no hay nada que verificar
  const [state, setState] = useState(token ? 'loading' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'El enlace no es válido. Revisa que lo hayas copiado completo.'
  );

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    API.public.verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setState('ok');
        setMessage('Tu correo quedó verificado y tu cuenta está activa.');
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setMessage(err.message || 'No se pudo verificar el correo.');
      });

    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="login-wrapper">
      <div className="login-orb login-orb-one"></div>
      <div className="login-orb login-orb-two"></div>

      <div className="login-content">
        <div className="login-brand">
          <h1><BrandLogo height={64} /></h1>
          <p>Gestión inteligente de inventario</p>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <span className="login-eyebrow">Verificación de correo</span>
            <h2>
              {state === 'loading' && 'Verificando...'}
              {state === 'ok' && '¡Listo!'}
              {state === 'error' && 'No pudimos verificar el correo'}
            </h2>
            <p role={state === 'error' ? 'alert' : 'status'}>
              {state === 'loading' ? 'Estamos confirmando tu dirección.' : message}
            </p>
          </div>

          {state !== 'loading' && (
            <Link className="login-submit" to="/" style={{ textAlign: 'center', textDecoration: 'none' }}>
              {state === 'ok' ? 'Iniciar sesión' : 'Ir al inicio de sesión'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
