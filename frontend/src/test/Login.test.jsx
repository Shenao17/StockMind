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

  it('muestra los campos de correo y contraseña', () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/tucorreo@empresa.com/i)).toBeInTheDocument();
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

  it('muestra error si solo se llena el correo', async () => {
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), {
      target: { value: 'admin@stockmind.com' },
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
  it('envía el correo (sin espacios sobrantes) y la contraseña, nunca un "username"', async () => {
    const spy = vi.spyOn(apiModule.API.auth, 'login').mockResolvedValue({
      user: { id: 1, username: 'ana', email: 'ana@empresa.com', role: 'ADMIN', organizationId: 3 },
    });
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: '  ana@empresa.com ' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'Clave1234' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ email: 'ana@empresa.com', password: 'Clave1234' }));
    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@empresa.com' }));
  });

  it('cambia el texto del botón a "Verificando..." mientras carga', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ token: 'abc', userId: 1, username: 'admin', role: 'ADMIN' }), 200))
    );
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: 'admin@stockmind.com' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/verificando/i)).toBeInTheDocument();
  });

  it('muestra error cuando la API rechaza las credenciales', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockRejectedValue(new Error('Credenciales inválidas'));
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: 'admin@stockmind.com' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/credenciales inválidas/i)).toBeInTheDocument();
  });

  it('muestra error cuando el servidor no responde', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockRejectedValue(new Error('No se puede conectar con el servidor'));
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: 'admin@stockmind.com' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/no se puede conectar/i)).toBeInTheDocument();
  });
});

describe('Login — equipo de plataforma', () => {
  it('con un desafío muestra el segundo paso en vez de abrir sesión', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockResolvedValue({
      challenge: { token: 't', mfaRequired: true, enrollmentRequired: false, mustChangePassword: false, fullName: 'Sebas' },
    });
    mockLogin.mockClear();
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: 'd@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'Clave1234' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/verificación en dos pasos/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/ingrese su contraseña/i)).toBeNull();
  });

  it('al terminar el segundo paso carga los permisos del perfil y abre sesión', async () => {
    vi.spyOn(apiModule.API.auth, 'login').mockResolvedValue({
      challenge: { token: 't', mfaRequired: true, enrollmentRequired: false, fullName: null },
    });
    vi.spyOn(apiModule.API.auth, 'mfaVerify').mockResolvedValue({ user: { id: 1, email: 'd@x.com', role: 'PLATFORM_OWNER' } });
    vi.spyOn(apiModule.API.auth, 'me').mockResolvedValue({ id: 1, role: 'PLATFORM_OWNER', fullName: 'Sebas', permissions: ['ORG_VIEW'] });
    mockLogin.mockClear();
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/tucorreo@empresa.com/i), { target: { value: 'd@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/ingrese su contraseña/i), { target: { value: 'Clave1234' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'PLATFORM_OWNER', fullName: 'Sebas', permissions: ['ORG_VIEW'] })));
  });
});
