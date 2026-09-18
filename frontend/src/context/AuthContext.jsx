import { createContext, useContext, useState, useEffect } from 'react';
import { API, Auth } from '../api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading=true mientras se confirma si hay sesión activa (cookie válida)
  // preguntándole al gateway. Evita un parpadeo mostrando "no logueado"
  // antes de saber la respuesta real.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.auth.me()
      .then((data) => {
        if (data) {
          Auth.setUser(data);
          setUser(data);
        }
      })
      .catch(() => {
        Auth.clearUser();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Ya NO recibe token — el gateway lo puso en la cookie httpOnly durante
  // el login. Aquí solo guardamos el user que vino en la respuesta.
  const login = (userData) => {
    Auth.setUser(userData);
    setUser(userData);
  };

  const logout = async () => {
    try {
      await API.auth.logout(); // limpia la cookie del lado del servidor
    } catch {
      // Si el logout falla en el servidor, igual limpiamos el estado local
    }
    Auth.clearUser();
    setUser(null);
  };

  const isAdmin = () => user?.role === 'ADMIN';
  const isLoggedIn = () => !!user;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isLoggedIn, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
