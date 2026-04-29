import { createContext, useContext, useState } from 'react';
import { Auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => Auth.getUser());

  const login = (token, userData) => {
    Auth.setSession(token, userData);
    setUser(userData);
  };

  const logout = () => {
    Auth.clearSession();
    setUser(null);
  };

  const isAdmin = () => user?.role === 'ADMIN';
  const isLoggedIn = () => !!user && !!Auth.getToken();

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
