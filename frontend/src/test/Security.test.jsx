import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Security from '../pages/Security';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));

const status = (over = {}) => ({ enabled: false, requiredByCompany: false, canDisable: false, backupCodesLeft: 0, ...over });

function setup({ st = status(), admin = false, policy = false } = {}) {
  const statusSpy = vi.spyOn(apiModule.API.mfa, 'status').mockResolvedValue(st);
  vi.spyOn(apiModule.API.users, 'mfaPolicy').mockResolvedValue({ required: policy });
  const toast = vi.fn();
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user: { id: 1, role: admin ? 'ADMIN' : 'SELLER' }, isAdmin: () => admin }}>
        <Security showToast={toast} />
      </AuthContext.Provider>
    </MemoryRouter>
  );
  return { statusSpy, toast };
}
afterEach(() => vi.restoreAllMocks());

describe('Security — activar', () => {
  it('pide la contraseña, muestra QR y clave, y al confirmar el código entrega los códigos de respaldo', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /^activar$/i }));
    const start = vi.spyOn(apiModule.API.mfa, 'setupStart').mockResolvedValue({ secret: 'ABCDEFGH23456789', otpauthUri: 'otpauth://totp/x' });
    const finish = vi.spyOn(apiModule.API.mfa, 'setupFinish').mockResolvedValue({ backupCodes: ['AAAAA11111', 'BBBBB22222'] });

    fireEvent.change(screen.getByLabelText(/confirma tu contraseña/i), { target: { value: 'Clave1234' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('Clave1234'));
    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('ABCDEFGH23456789');
    expect(await screen.findByAltText(/código qr/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Código de la app'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^activar$/i }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('AAAAA11111')).toBeInTheDocument();
  });

  it('una contraseña incorrecta muestra el error y no avanza', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /^activar$/i }));
    vi.spyOn(apiModule.API.mfa, 'setupStart').mockRejectedValue(new Error('La contraseña no es correcta'));
    fireEvent.change(screen.getByLabelText(/confirma tu contraseña/i), { target: { value: 'mala' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText('La contraseña no es correcta')).toBeInTheDocument();
    expect(screen.queryByTestId('mfa-secret')).toBeNull();
  });
});

describe('Security — desactivar y política', () => {
  it('con el 2FA activo permite desactivar con contraseña y código', async () => {
    setup({ st: status({ enabled: true, canDisable: true, backupCodesLeft: 7 }) });
    expect(await screen.findByText('Activada')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    const disable = vi.spyOn(apiModule.API.mfa, 'disable').mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: /^desactivar$/i }));
    fireEvent.change(screen.getByLabelText('Tu contraseña'), { target: { value: 'Clave1234' } });
    fireEvent.change(screen.getByLabelText(/código de la app/i), { target: { value: '123456' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^desactivar$/i }).pop());
    await waitFor(() => expect(disable).toHaveBeenCalledWith('Clave1234', '123456'));
  });

  it('si la empresa lo exige no ofrece desactivar', async () => {
    setup({ st: status({ enabled: true, requiredByCompany: true, canDisable: false, backupCodesLeft: 8 }) });
    expect(await screen.findByText(/tu empresa exige/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^desactivar$/i })).toBeNull();
  });

  it('un vendedor no ve la política de la empresa', async () => {
    setup();
    await screen.findByText('Desactivada');
    expect(screen.queryByText(/política de la empresa/i)).toBeNull();
  });

  it('el admin puede exigirla a toda la empresa (con confirmación)', async () => {
    setup({ admin: true, policy: false });
    const set = vi.spyOn(apiModule.API.users, 'setMfaPolicy').mockResolvedValue({ required: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: /exigirla a todos/i }));
    await waitFor(() => expect(set).toHaveBeenCalledWith(true));
  });

  it('si el admin cancela la confirmación no cambia la política', async () => {
    setup({ admin: true, policy: false });
    const set = vi.spyOn(apiModule.API.users, 'setMfaPolicy').mockResolvedValue({ required: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(await screen.findByRole('button', { name: /exigirla a todos/i }));
    expect(set).not.toHaveBeenCalled();
  });
});
