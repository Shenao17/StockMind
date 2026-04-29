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
    if (!username || !password) { setError('Complete todos los campos'); return; }
    setLoading(true);
    setError('');
    try {
      const response = await API.auth.login({ username, password });
      if (response?.token) {
        login(response.token, {
          id:       response.userId,
          username: response.username,
          role:     response.role,
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
      <div className="login-card">
        <h1>StockMind</h1>
        <p>Sistema de gestión de inventario y predicción de demanda</p>

        {error && <div className="login-error visible">{error}</div>}

        <div className="form-group">
          <label htmlFor="username">Usuario</label>
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

        <div className="form-group">
          <label htmlFor="password">Contraseña</label>
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

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Verificando...' : 'Iniciar sesión'}
        </button>

        <p className="version-tag">StockMind v1.0.0 — Proyecto Académico</p>
      </div>
    </div>
  );
}
