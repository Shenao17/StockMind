import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import PlanBanner from '../components/ui/PlanBanner';
import FeatureGate from '../components/ui/FeatureGate';
import { renderWithPlan, sub } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('PlanBanner', () => {
  it('prueba con muchos días: aviso informativo', async () => {
    renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'TRIAL', trialDaysLeft: 12 }) });
    expect(await screen.findByText(/te quedan 12 días/i)).toBeInTheDocument();
    expect(screen.queryByText(/elige un plan/i)).not.toBeInTheDocument();
  });

  it('a 5 días o menos del fin de la prueba: pide elegir un plan', async () => {
    renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'TRIAL', trialDaysLeft: 5 }) });
    expect(await screen.findByText(/quedan 5 días/i)).toBeInTheDocument();
    expect(screen.getByText(/elige un plan para no perder el acceso/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver planes/i })).toHaveAttribute('href', '/billing');
  });

  it('último día y día cero', async () => {
    const { unmount } = renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'TRIAL', trialDaysLeft: 1 }) });
    expect(await screen.findByText(/queda 1 día/i)).toBeInTheDocument();
    unmount();
    renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'TRIAL', trialDaysLeft: 0 }) });
    expect(await screen.findByText(/termina hoy/i)).toBeInTheDocument();
  });

  it('plan vencido: avisa del modo solo lectura', async () => {
    renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'GRACE', readOnly: true, graceEndsAt: '2026-12-01T00:00:00' }) });
    expect(await screen.findByText(/modo solo lectura/i)).toBeInTheDocument();
  });

  it('plan pagado por vencer', async () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString();
    renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'ACTIVE', currentPeriodEnd: soon }) });
    expect(await screen.findByText(/tu plan vence en/i)).toBeInTheDocument();
  });

  it('no muestra nada si todo está en orden ni en cuentas de cortesía', async () => {
    const far = new Date(Date.now() + 30 * 86400000).toISOString();
    const { container, unmount } = renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'ACTIVE', currentPeriodEnd: far }) });
    await screen.findByRole('link', { hidden: true }).catch(() => {});
    expect(container.querySelector('.plan-banner')).toBeNull();
    unmount();
    const r = renderWithPlan(<PlanBanner />, { subscription: sub({ status: 'GRACE', complimentary: true }) });
    expect(r.container.querySelector('.plan-banner')).toBeNull();
  });
});

describe('FeatureGate', () => {
  it('muestra el contenido si el plan incluye la función', async () => {
    renderWithPlan(<FeatureGate feature="REPORTS"><p>Contenido de reportes</p></FeatureGate>);
    expect(await screen.findByText(/contenido de reportes/i)).toBeInTheDocument();
  });

  it('si no la incluye, invita a mejorar el plan en vez de mostrar el contenido', async () => {
    renderWithPlan(<FeatureGate feature="REPORTS"><p>Contenido de reportes</p></FeatureGate>,
      { subscription: sub({ planName: 'Starter', features: [] }) });
    expect(await screen.findByText(/no está incluida en tu plan starter/i)).toBeInTheDocument();
    expect(screen.queryByText(/contenido de reportes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver planes/i })).toHaveAttribute('href', '/billing');
  });
});
