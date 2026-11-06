import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import VerifyEmail from '../pages/VerifyEmail';
import * as apiModule from '../api';

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <VerifyEmail />
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VerifyEmail', () => {
  it('envía el token del enlace al servidor y confirma la activación', async () => {
    const spy = vi.spyOn(apiModule.API.public, 'verifyEmail').mockResolvedValue({ message: 'ok' });
    renderAt('/verify-email?token=abc123');

    expect(screen.getByText(/verificando/i)).toBeInTheDocument();
    expect(await screen.findByText(/¡listo!/i)).toBeInTheDocument();
    expect(screen.getByText(/cuenta está activa/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('abc123');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/');
  });

  it('muestra el mensaje del servidor cuando el enlace venció o ya se usó', async () => {
    vi.spyOn(apiModule.API.public, 'verifyEmail')
      .mockRejectedValue(new Error('El enlace de verificación no es válido o ya venció. Solicita uno nuevo.'));
    renderAt('/verify-email?token=viejo');

    expect(await screen.findByText(/no pudimos verificar el correo/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/ya venció/i);
  });

  it('sin token en el enlace no llama al servidor', async () => {
    const spy = vi.spyOn(apiModule.API.public, 'verifyEmail');
    renderAt('/verify-email');

    expect(await screen.findByText(/enlace no es válido/i)).toBeInTheDocument();
    await waitFor(() => expect(spy).not.toHaveBeenCalled());
  });
});
