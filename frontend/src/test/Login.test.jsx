import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Login from '../pages/Login';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

// ── Helpers ───────────────────────────────────────────────
const mockLogin = vi.fn();
const mockIsLoggedIn = vi.fn(() => false);

function renderLogin(showToast = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ login: mockLogin, isLoggedIn: mockIsLoggedIn, user: null }}>
        <Login showToast={showToast} />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────
describe('Login — renderizado inicial', () => {
  it('muestra el título StockMind', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /stockmind/i })).toBeInTheDocument();
  });

  it('muestra los campos de usuario y contraseña', () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/ingrese su usuario/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ingrese su contraseña/i)).toBeInTheDocument();
  });

  it('muestra el botón de iniciar sesión', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('no muestra error al cargar', () => {
    renderLogin();
    const error = screen.queryByText(/complete todos los campos/i);
    expect(error).not.toBeInTheDocument();
  });
});

describe('Login — validaciones', () => {
  it('muestra error si se intenta login con campos vacíos', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => {
      expect(screen.getByText(/complete todos los campos/i)).toBeInTheDocument();
    });
  });

  it('muestra error si solo se llena el usuario', async () => {
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/ingrese su usuario/i), {
      target: { value: 'admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => {
      expect(screen.getByText(/complete todos los campos/i)).toBeInTheDocument();
    });
  });

  it('muestra error si solo se llena la contraseña', async () => {
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => {
      expect(screen.getByText(/complete todos los campos/i)).toBeInTheDocument();
    });
  });
});

describe('Login — interacción con la API', () => {
  it('cambia el texto del botón a "Verificando..." mientras carga', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ token: 'abc', userId: 1, username: 'admin', role: 'ADMIN' }), 200))
    );
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/ingrese su usuario/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/verificando/i)).toBeInTheDocument();
  });

  it('muestra error cuando la API rechaza las credenciales', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockRejectedValue(new Error('Credenciales inválidas'));
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/ingrese su usuario/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/credenciales inválidas/i)).toBeInTheDocument();
  });

  it('muestra error cuando el servidor no responde', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockRejectedValue(new Error('No se puede conectar con el servidor'));
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/ingrese su usuario/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/no se puede conectar/i)).toBeInTheDocument();
  });
});
