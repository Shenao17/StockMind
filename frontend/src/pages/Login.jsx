import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';
import { isPlatformRole } from '../platformRoles';
import MfaStep from '../components/MfaStep';
import BrandLogo from '../components/ui/BrandLogo';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoggedIn, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);   // equipo de plataforma: segundo paso pendiente

  const homeFor = (u) => (isPlatformRole(u?.role) ? '/platform' : '/dashboard');

  if (isLoggedIn()) {
    navigate(homeFor(user), { replace: true });
    return null;
  }

  // Sesión abierta: el equipo de plataforma necesita además sus permisos (/auth/me) para dibujar el panel
  async function finish(u) {
    let full = u;
    if (isPlatformRole(u.role)) {
      try { full = { ...u, ...(await API.auth.me()) }; } catch { /* sin permisos extra el panel solo muestra lo básico */ }
    }
    login(full);
    navigate(homeFor(full), { replace: true });
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Complete todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await API.auth.login({
        email: email.trim(),
        password,
      });

      // El token ya no viaja en el body: el gateway lo puso en una cookie
      // httpOnly. Aquí solo llega { user: { id, username, email, organizationId, role } }.
      if (response?.challenge) {
        setPassword('');
        setChallenge(response.challenge);
      } else if (response?.user) {
        finish(response.user);
      } else {
        setError('Respuesta inesperada del servidor');
      }
    } catch (err) {
      setError(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">

      {/* Fondo decorativo */}
      <div className="login-orb login-orb-one"></div>
      <div className="login-orb login-orb-two"></div>
      <div className="login-stars">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      </div>

      <div className="login-content">

        {/* Identidad */}
        <div className="login-brand">
          <h1><BrandLogo height={64} /></h1>
          <p>Gestión inteligente de inventario</p>
        </div>

        {challenge && (
          <MfaStep challenge={challenge} onDone={finish}
            onCancel={() => setChallenge(null)} />
        )}

        {/* Tarjeta */}
        {!challenge && (
        <div className="login-card">

          <div className="login-card-header">
            <span className="login-eyebrow">Bienvenido</span>

            <h2>Bienvenido de nuevo</h2>

            <p>
              Ingresa a tu espacio de trabajo para continuar.
            </p>
          </div>

          {error && (
            <div className="login-error visible">
              <span className="login-error-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          <div className="form-group login-field">
            <label htmlFor="email">Correo electrónico</label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">◉</span>

              <input
                id="email"
                type="email"
                placeholder="tucorreo@empresa.com"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>

          <div className="form-group login-field">
            <label htmlFor="password">Contraseña</label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">◈</span>

              <input
                id="password"
                type="password"
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>

          <button
            className="login-submit"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner"></span>
                Verificando...
              </>
            ) : (
              <>
                <span>Iniciar sesión</span>
                <span className="login-submit-arrow">→</span>
              </>
            )}
          </button>

          <div className="login-footer">
            <span>StockMind</span>
            <span className="login-footer-separator">·</span>
            <span>v{__APP_VERSION__}</span>
            <span className="login-footer-separator">·</span>
            <span>AI Agent Experimental</span>
          </div>

        </div>
        )}

        <p className="login-copyright">
          Sistema de gestión de inventario
        </p>

      </div>
    </div>
  );
}
