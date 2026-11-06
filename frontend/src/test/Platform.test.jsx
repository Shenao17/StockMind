import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import Platform from '../pages/Platform';
import * as apiModule from '../api';

const org = (over = {}) => ({
  id: 7, name: 'Ferretería El Tornillo', taxId: '900123456-7', contactEmail: 'g@tornillo.com', status: 'ACTIVE',
  origin: 'SELF_SIGNUP', subscription: { planCode: 'PRO', planName: 'Pro', status: 'TRIAL', billingCycle: 'MONTHLY',
    complimentary: false, trialEndsAt: '2026-11-20T10:00:00' }, ...over,
});
const envelope = (content, extra = {}) => ({ content, page: 0, size: 10, totalElements: content.length, totalPages: 1, ...extra });
const plans = [
  { code: 'STARTER', name: 'Starter', totalMonthly: 71281 }, { code: 'PRO', name: 'Pro', totalMonthly: 142681 },
];

function setup(list = envelope([org()])) {
  const orgsSpy = vi.spyOn(apiModule.API.platform, 'organizations').mockImplementation(async () => list);
  vi.spyOn(apiModule.API.public, 'plans').mockResolvedValue(plans);
  const toast = vi.fn();
  render(<Platform showToast={toast} />);
  return { orgsSpy, toast };
}

afterEach(() => vi.restoreAllMocks());

describe('Platform', () => {
  it('lista las empresas con su estado, plan y vencimiento', async () => {
    setup();
    expect(await screen.findByText('Ferretería El Tornillo')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText(/pro · prueba/i)).toBeInTheDocument();
    expect(screen.getByText('Autoregistro')).toBeInTheDocument();
    expect(screen.getByText('1 empresas')).toBeInTheDocument();
  });

  it('busca y filtra en el servidor', async () => {
    const { orgsSpy } = setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre/i), { target: { value: 'torn' } });
    await waitFor(() => expect(orgsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'torn', page: 0 })));
    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: 'PENDING' } });
    await waitFor(() => expect(orgsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PENDING' })));
  });

  it('crea una empresa con plan y condición', async () => {
    const create = vi.spyOn(apiModule.API.platform, 'create').mockResolvedValue({});
    setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.click(screen.getByRole('button', { name: /nueva empresa/i }));
    const dialog = await waitFor(() => {
      const el = document.querySelector('.modal');
      if (!el) throw new Error('modal no abierto');
      return el;
    });
    const q = within(dialog);
    const inputs = dialog.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Cliente Nuevo' } });
    fireEvent.change(inputs[1], { target: { value: '901222333-4' } });
    fireEvent.change(dialog.querySelector('input[type="email"]'), { target: { value: 'a@nuevo.com' } });
    fireEvent.change(dialog.querySelector('input[type="password"]'), { target: { value: 'Clave1234' } });
    fireEvent.click(q.getByRole('button', { name: /^crear$/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      companyName: 'Cliente Nuevo', taxId: '901222333-4', adminEmail: 'a@nuevo.com', planCode: 'PRO', mode: 'TRIAL' })));
  });

  it('suspender pide confirmación y llama a la acción', async () => {
    const action = vi.spyOn(apiModule.API.platform, 'action').mockResolvedValue({});
    vi.stubGlobal('confirm', vi.fn(() => true));
    setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.change(screen.getByLabelText(/acción para ferretería/i), { target: { value: 'suspend' } });
    await waitFor(() => expect(action).toHaveBeenCalledWith(7, 'suspend', {}));
    vi.unstubAllGlobals();
  });

  it('si no se confirma, no se ejecuta la acción', async () => {
    const action = vi.spyOn(apiModule.API.platform, 'action').mockResolvedValue({});
    vi.stubGlobal('confirm', vi.fn(() => false));
    setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.change(screen.getByLabelText(/acción para ferretería/i), { target: { value: 'cancel' } });
    expect(action).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('extender la prueba pide los días', async () => {
    const action = vi.spyOn(apiModule.API.platform, 'action').mockResolvedValue({});
    setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.change(screen.getByLabelText(/acción para ferretería/i), { target: { value: 'extend-trial' } });
    const days = await screen.findByLabelText(/días a sumar/i).catch(() => document.querySelector('input[type="number"]'));
    fireEvent.change(days, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(7, 'extend-trial', { days: 10 }));
  });

  it('generar un enlace de pago lo muestra para copiar', async () => {
    vi.spyOn(apiModule.API.platform, 'action').mockResolvedValue({ checkoutUrl: 'http://localhost:5173/pay/abc123' });
    setup();
    await screen.findByText('Ferretería El Tornillo');
    fireEvent.change(screen.getByLabelText(/acción para ferretería/i), { target: { value: 'payment-links' } });
    fireEvent.click(await screen.findByRole('button', { name: /aceptar/i }));
    expect(await screen.findByDisplayValue('http://localhost:5173/pay/abc123')).toBeInTheDocument();
  });

  it('sin empresas muestra un mensaje', async () => {
    setup(envelope([]));
    expect(await screen.findByText(/aún no hay empresas/i)).toBeInTheDocument();
  });
});
