import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoggedIn } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoggedIn()) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  async function handleLogin() {
    if (!username || !password) {
      setError('Complete todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await API.auth.login({
        username,
        password,
      });

      if (response?.token) {
        login(response.token, {
          id: response.userId,
          username: response.username,
          role: response.role,
        });

        navigate('/dashboard', { replace: true });
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
          <h1>StockMind</h1>
          <p>Gestión inteligente de inventario</p>
        </div>

        {/* Tarjeta */}
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
            <label htmlFor="username">Usuario</label>

            <div className="login-input-wrapper">
              <span className="login-input-icon">◉</span>

              <input
                id="username"
                type="text"
                placeholder="Ingrese su usuario"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
            <span>v1.3.0</span>
            <span className="login-footer-separator">·</span>
            <span>AI Agent Experimental</span>
          </div>

        </div>

        <p className="login-copyright">
          Sistema de gestión de inventario
        </p>

      </div>
    </div>
  );
}