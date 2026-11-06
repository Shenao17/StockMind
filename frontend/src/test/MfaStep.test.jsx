import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import MfaStep from '../components/MfaStep';
import * as apiModule from '../api';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));

afterEach(() => vi.restoreAllMocks());

describe('MfaStep — verificar', () => {
  const challenge = { token: 'desafio', mfaRequired: true, enrollmentRequired: false, fullName: 'Sebas' };

  it('envía el código y entrega el usuario', async () => {
    const verify = vi.spyOn(apiModule.API.auth, 'mfaVerify').mockResolvedValue({ user: { id: 1, role: 'PLATFORM_OWNER' } });
    const onDone = vi.fn();
    render(<MfaStep challenge={challenge} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '12a3456' } });   // solo dígitos
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ challengeToken: 'desafio', code: '123456' }));
    expect(onDone).toHaveBeenCalledWith({ id: 1, role: 'PLATFORM_OWNER' });
  });

  it('un código incorrecto muestra el error y no abre sesión', async () => {
    vi.spyOn(apiModule.API.auth, 'mfaVerify').mockRejectedValue(new Error('Código incorrecto'));
    const onDone = vi.fn();
    render(<MfaStep challenge={challenge} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));
    expect(await screen.findByText('Código incorrecto')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('permite usar un código de respaldo', async () => {
    const verify = vi.spyOn(apiModule.API.auth, 'mfaVerify').mockResolvedValue({ user: { id: 1 } });
    render(<MfaStep challenge={challenge} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /código de respaldo/i }));
    fireEvent.change(screen.getByLabelText('Código de respaldo'), { target: { value: 'ABCDE12345' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ challengeToken: 'desafio', code: 'ABCDE12345' }));
  });
});

describe('MfaStep — primer acceso', () => {
  const challenge = { token: 'desafio', mfaRequired: false, enrollmentRequired: true, mustChangePassword: true };

  function setup() {
    vi.spyOn(apiModule.API.auth, 'enrollStart').mockResolvedValue({ secret: 'ABCDEFGH23456789', otpauthUri: 'otpauth://totp/x' });
    const finish = vi.spyOn(apiModule.API.auth, 'enrollFinish')
      .mockResolvedValue({ user: { id: 1, role: 'PLATFORM_SUPPORT' }, backupCodes: ['AAAAA11111', 'BBBBB22222'] });
    const onDone = vi.fn();
    render(<MfaStep challenge={challenge} onDone={onDone} onCancel={vi.fn()} />);
    return { finish, onDone };
  }

  it('muestra la clave para escribir a mano y el QR', async () => {
    setup();
    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('ABCDEFGH23456789');
    expect(await screen.findByAltText(/código qr/i)).toBeInTheDocument();
  });

  it('valida contraseñas y PIN antes de enviar', async () => {
    const { finish } = setup();
    await screen.findByTestId('mfa-secret');
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'NuevaClave99' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: 'Otra' } });
    fireEvent.click(screen.getByRole('button', { name: /terminar configuración/i }));
    expect(await screen.findByText(/contraseñas no coinciden/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: 'NuevaClave99' } });
    fireEvent.change(screen.getByLabelText(/pin de confirmación/i), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /terminar configuración/i }));
    expect(await screen.findByText(/entre 6 y 10 dígitos/i)).toBeInTheDocument();
    expect(finish).not.toHaveBeenCalled();
  });

  it('completa la configuración, muestra los códigos de respaldo una vez y recién entonces abre sesión', async () => {
    const { finish, onDone } = setup();
    await screen.findByTestId('mfa-secret');
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'NuevaClave99' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: 'NuevaClave99' } });
    fireEvent.change(screen.getByLabelText('Código de la app'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/pin de confirmación/i), { target: { value: '482915' } });
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /terminar configuración/i }));

    await waitFor(() => expect(finish).toHaveBeenCalledWith(
      { challengeToken: 'desafio', code: '123456', pin: '482915', newPassword: 'NuevaClave99' }));
    expect(await screen.findByText('AAAAA11111')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /ya los guardé/i }));
    expect(onDone).toHaveBeenCalledWith({ id: 1, role: 'PLATFORM_SUPPORT' });
  });
});
