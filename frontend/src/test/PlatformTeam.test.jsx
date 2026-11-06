import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import PlatformTeam from '../pages/PlatformTeam';
import * as apiModule from '../api';

const owner = { id: 1, fullName: 'Sebas', email: 'dueno@x.com', role: 'PLATFORM_OWNER', active: true, mfaEnabled: true, mustChangePassword: false, createdAt: '2026-11-01T10:00:00' };
const ana = { id: 2, fullName: 'Ana Soporte', email: 'ana@x.com', role: 'PLATFORM_SUPPORT', active: true, mfaEnabled: false, mustChangePassword: true, createdAt: '2026-11-05T10:00:00' };

function setup(list = [owner, ana]) {
  const team = apiModule.API.platform.team;
  vi.spyOn(team, 'list').mockResolvedValue(list);
  const toast = vi.fn();
  render(<PlatformTeam showToast={toast} />);
  return { team, toast };
}
afterEach(() => vi.restoreAllMocks());

describe('PlatformTeam', () => {
  it('lista el equipo; el dueño no se puede modificar', async () => {
    setup();
    expect(await screen.findByText('Ana Soporte')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.queryByLabelText(/rol de dueno@x.com/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: /desactivar/i })).toHaveLength(1);
  });

  it('agrega un miembro: pide el PIN y muestra la contraseña temporal una sola vez', async () => {
    const { team } = setup();
    vi.spyOn(team, 'create').mockResolvedValue({ member: { ...ana, id: 3, email: 'nuevo@x.com' }, temporaryPassword: 'A9TempPass1234' });
    await screen.findByText('Ana Soporte');
    fireEvent.click(screen.getByRole('button', { name: /agregar miembro/i }));
    const dialog = await waitFor(() => { const el = document.querySelector('.modal'); if (!el) throw new Error('x'); return el; });
    const inputs = dialog.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Nuevo Miembro' } });
    fireEvent.change(dialog.querySelector('input[type="email"]'), { target: { value: 'nuevo@x.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /continuar/i }));

    const pinInput = await screen.findByLabelText('PIN');
    fireEvent.change(pinInput, { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    await waitFor(() => expect(team.create).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Nuevo Miembro', email: 'nuevo@x.com', role: 'PLATFORM_SUPPORT', pin: '482915' })));
    expect(await screen.findByTestId('temp-password')).toHaveTextContent('A9TempPass1234');
  });

  it('un PIN incorrecto se avisa y se vuelve a pedir, sin cerrar el cuadro', async () => {
    const { team, toast } = setup();
    vi.spyOn(team, 'update').mockRejectedValue(Object.assign(new Error('PIN incorrecto'), { code: 'PIN_INVALID' }));
    await screen.findByText('Ana Soporte');
    fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    expect(await screen.findByText('PIN incorrecto')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it('cambiar el rol envía solo el rol y el PIN', async () => {
    const { team } = setup();
    vi.spyOn(team, 'update').mockResolvedValue({});
    await screen.findByText('Ana Soporte');
    fireEvent.change(screen.getByLabelText(/rol de ana@x.com/i), { target: { value: 'PLATFORM_VIEWER' } });
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(team.update).toHaveBeenCalledWith(2, { role: 'PLATFORM_VIEWER', pin: '482915' }));
  });

  it('reiniciar el acceso muestra la nueva contraseña temporal', async () => {
    const { team } = setup();
    vi.spyOn(team, 'resetAccess').mockResolvedValue({ member: ana, temporaryPassword: 'A9OtraTemporal12' });
    await screen.findByText('Ana Soporte');
    fireEvent.click(screen.getByRole('button', { name: /reiniciar acceso/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(team.resetAccess).toHaveBeenCalledWith(2, '482915'));
    expect(await screen.findByTestId('temp-password')).toHaveTextContent('A9OtraTemporal12');
  });
});
