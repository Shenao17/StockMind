import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import PlatformCompany from '../pages/PlatformCompany';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

const OWNER = ['ORG_VIEW', 'ORG_EDIT_CONTACT', 'PAYMENT_VIEW', 'SENSITIVE', 'TEAM_MANAGE'];
const SUPPORT = ['ORG_VIEW', 'ORG_EDIT_CONTACT'];
const BILLING = ['ORG_VIEW', 'PAYMENT_VIEW', 'PAYMENT_LINK'];

const detail = (over = {}) => ({
  organization: { id: 7, name: 'Ferretería El Tornillo', legalName: 'El Tornillo SAS', taxId: '900123456-7', contactEmail: 'g@tornillo.com',
    phone: '3001234567', country: 'CO', status: 'ACTIVE', origin: 'SELF_SIGNUP', createdAt: '2026-10-01T10:00:00' },
  requireMfa: true, termsAcceptedAt: '2026-10-01T10:00:00', termsVersion: '2026-11',
  plan: { planCode: 'PRO', planName: 'Pro', status: 'ACTIVE', billingCycle: 'MONTHLY', complimentary: false, trialEndsAt: null, trialDaysLeft: null,
    currentPeriodEnd: '2026-12-01T10:00:00', graceEndsAt: null, features: ['REPORTS', 'PREDICTIONS'], maxUsers: 5, maxProducts: 3000,
    usage: { users: 4, products: 2900 } },
  users: [
    { id: 1, username: 'gerente', email: 'g@tornillo.com', role: 'ADMIN', active: true, mfaEnabled: true, createdAt: '2026-10-01T10:00:00' },
    { id: 2, username: 'caja', email: 'c@tornillo.com', role: 'SELLER', active: true, mfaEnabled: false, createdAt: '2026-10-02T10:00:00' },
  ],
  paymentsVisible: true,
  payments: [{ id: 9, planCode: 'PRO', planName: 'Pro', billingCycle: 'MONTHLY', provider: 'SIMULATED', amountNet: 119900, ivaAmount: 22781,
    amountTotal: 142681, status: 'PAID', createdByPlatform: false, createdAt: '2026-11-01T10:00:00', paidAt: '2026-11-01T10:05:00' }],
  timeline: [
    { at: '2026-11-01T10:05:00', type: 'PAYMENT', title: 'Pago recibido Pro', actor: null, details: 'total 142681' },
    { at: '2026-10-15T09:00:00', type: 'AUDIT', title: 'TRIAL_EXTENDED', actor: 'soporte@x.com', details: 'días=5' },
    { at: '2026-10-01T10:00:00', type: 'ORGANIZATION', title: 'Se registró desde la web', actor: null, details: null },
  ],
  ...over,
});

function setup(permissions = OWNER, d = detail()) {
  const spy = vi.spyOn(apiModule.API.platform, 'detail').mockResolvedValue(d);
  const toast = vi.fn();
  render(
    <MemoryRouter initialEntries={['/platform/orgs/7']}>
      <AuthContext.Provider value={{ user: { id: 1, role: 'PLATFORM_OWNER', permissions } }}>
        <Routes><Route path="/platform/orgs/:id" element={<PlatformCompany showToast={toast} />} /></Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
  return { spy, toast };
}
afterEach(() => vi.restoreAllMocks());

describe('PlatformCompany — contenido', () => {
  it('muestra datos, plan con uso frente a límites, usuarios, cobros y línea de tiempo', async () => {
    const { spy } = setup();
    expect(await screen.findByRole('heading', { name: 'Ferretería El Tornillo' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('7');
    expect(screen.getByText('El Tornillo SAS')).toBeInTheDocument();
    expect(screen.getByText(/exigido a todos/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Usuarios activos' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByText('2900 / 3000')).toBeInTheDocument();
    expect(screen.getByText(/reportes, predicciones/i)).toBeInTheDocument();
    expect(screen.getByText('caja')).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    const tl = within(screen.getByRole('list', { name: /línea de tiempo/i }));
    expect(tl.getByText('Prueba extendida')).toBeInTheDocument();          // acción traducida
    expect(tl.getByText(/por soporte@x.com · días=5/)).toBeInTheDocument();
    expect(tl.getByText('Se registró desde la web')).toBeInTheDocument();
  });

  it('un error al cargar (p. ej. 404) se muestra con un enlace para volver', async () => {
    vi.spyOn(apiModule.API.platform, 'detail').mockRejectedValue(new Error('Empresa no encontrada'));
    render(<MemoryRouter initialEntries={['/platform/orgs/7']}><AuthContext.Provider value={{ user: { permissions: OWNER } }}>
      <Routes><Route path="/platform/orgs/:id" element={<PlatformCompany />} /></Routes></AuthContext.Provider></MemoryRouter>);
    expect(await screen.findByText(/empresa no encontrada/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver/i })).toBeInTheDocument();
  });
});

describe('PlatformCompany — permisos', () => {
  it('soporte: puede corregir datos pero no el NIT, ni reiniciar 2FA, ni ve cobros', async () => {
    setup(SUPPORT, detail({ paymentsVisible: false, payments: [] }));
    await screen.findByRole('heading', { name: 'Ferretería El Tornillo' });
    expect(screen.getByRole('button', { name: /corregir datos/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /corregir nit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reiniciar 2fa/i })).toBeNull();
    expect(screen.getByText(/no incluye ver los cobros/i)).toBeInTheDocument();
  });

  it('cobranza: ve los cobros pero no puede corregir nada', async () => {
    setup(BILLING);
    await screen.findByRole('heading', { name: 'Ferretería El Tornillo' });
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /corregir/i })).toBeNull();
  });
});

describe('PlatformCompany — correcciones', () => {
  it('corregir datos envía solo los campos que cambiaron', async () => {
    setup();
    const upd = vi.spyOn(apiModule.API.platform, 'updateContact').mockResolvedValue({});
    fireEvent.click(await screen.findByRole('button', { name: /corregir datos/i }));
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '3109998888' } });
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith('7', { phone: '3109998888' }));
  });

  it('guardar sin cambios avisa y no llama a la API', async () => {
    const { toast } = setup();
    const upd = vi.spyOn(apiModule.API.platform, 'updateContact').mockResolvedValue({});
    fireEvent.click(await screen.findByRole('button', { name: /corregir datos/i }));
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }));
    expect(upd).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('No hay cambios que guardar', 'error');
  });

  it('el NIT pide el PIN: uno incorrecto se avisa y se reintenta; el correcto guarda', async () => {
    setup();
    const upd = vi.spyOn(apiModule.API.platform, 'updateTaxId')
      .mockRejectedValueOnce(Object.assign(new Error('PIN incorrecto'), { code: 'PIN_INVALID' }))
      .mockResolvedValueOnce({});
    fireEvent.click(await screen.findByRole('button', { name: /corregir nit/i }));
    fireEvent.change(screen.getByLabelText('NIT'), { target: { value: '900555666-1' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    expect(await screen.findByText('PIN incorrecto')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(upd).toHaveBeenLastCalledWith('7', '900555666-1', '482915'));
  });

  it('reiniciar el 2FA de un usuario solo aparece si lo tiene activo y pide el PIN', async () => {
    setup();
    const reset = vi.spyOn(apiModule.API.platform, 'resetUserMfa').mockResolvedValue({});
    const buttons = await screen.findAllByRole('button', { name: /reiniciar 2fa/i });
    expect(buttons).toHaveLength(1);                      // solo "gerente" tiene 2FA
    fireEvent.click(buttons[0]);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith('7', 1, '482915'));
  });
});
