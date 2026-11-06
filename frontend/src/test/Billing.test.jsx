import { screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import Billing from '../pages/Billing';
import * as apiModule from '../api';
import { renderWithPlan, sub } from './helpers';

const plans = [
  { code: 'STARTER', name: 'Starter', priceMonthly: 59900, ivaMonthly: 11381, totalMonthly: 71281, priceYearly: 599000, ivaYearly: 113810, totalYearly: 712810, maxUsers: 2, maxProducts: 300, extraUserPrice: 15000, features: [] },
  { code: 'PRO', name: 'Pro', priceMonthly: 119900, ivaMonthly: 22781, totalMonthly: 142681, priceYearly: 1199000, ivaYearly: 227810, totalYearly: 1426810, maxUsers: 5, maxProducts: 3000, extraUserPrice: 15000, features: ['PREDICTIONS', 'REPORTS'] },
];

function setup(opts = {}) {
  vi.spyOn(apiModule.API.billing, 'plans').mockResolvedValue(plans);
  vi.spyOn(apiModule.API.billing, 'payments').mockResolvedValue(opts.payments || []);
  return renderWithPlan(<Billing showToast={vi.fn()} />, opts);
}

afterEach(() => vi.restoreAllMocks());

describe('Billing', () => {
  it('muestra el plan actual, su estado y el uso frente a los límites', async () => {
    setup({ subscription: sub({ status: 'TRIAL', trialDaysLeft: 9, trialEndsAt: '2026-12-01T10:00:00' }) });
    expect(await screen.findByText('Tu plan')).toBeInTheDocument();
    expect(screen.getByText('Prueba gratis')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();      // usuarios
    expect(screen.getByText(/40 \/ 3000/)).toBeInTheDocument();  // productos
  });

  it('muestra cada plan con precio, IVA y total', async () => {
    setup();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?59\.900/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$\s?71\.281/).length).toBeGreaterThan(0);   // total con IVA
    expect(screen.getAllByText(/\$\s?142\.681/).length).toBeGreaterThan(0);
    expect(screen.getByText(/precios no incluyen iva/i)).toBeInTheDocument();
  });

  it('el ciclo anual cambia los precios', async () => {
    setup();
    await screen.findByText('Starter');
    fireEvent.click(screen.getByRole('button', { name: /anual/i }));
    expect(await screen.findAllByText(/\$\s?712\.810/)).not.toHaveLength(0);
  });

  it('un administrador elige un plan y se crea el cobro con el plan y el ciclo', async () => {
    const checkout = vi.spyOn(apiModule.API.billing, 'checkout').mockResolvedValue({
      reference: 'ref', checkoutUrl: 'http://localhost/pay/ref' });
    setup();
    await screen.findByText('Starter');
    // el plan actual (Pro) ofrece "Renovar"; el otro, "Elegir plan"
    fireEvent.click(screen.getByRole('button', { name: /renovar/i }));
    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ planCode: 'PRO', billingCycle: 'MONTHLY' }));
  });

  it('un vendedor no puede elegir plan', async () => {
    setup({ role: 'SELLER' });
    await screen.findByText('Starter');
    expect(screen.queryByRole('button', { name: /elegir plan/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/solo un administrador/i).length).toBeGreaterThan(0);
  });

  it('cuenta suspendida: lo indica y ofrece pagar', async () => {
    setup({ subscription: sub({ status: 'SUSPENDED', blocked: true }) });
    expect(await screen.findByText(/cuenta está suspendida/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /elegir plan|renovar/i }).length).toBeGreaterThan(0);
  });

  it('el administrador ve el historial de cobros', async () => {
    setup({ payments: [{ reference: 'a', planName: 'Pro', billingCycle: 'MONTHLY', amountTotal: 142681, status: 'PAID', paidAt: '2026-11-01T10:00:00' }] });
    expect(await screen.findByText('Historial de cobros')).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
  });
});
