import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import PlatformNav from '../components/PlatformNav';
import PlatformSummary from '../pages/PlatformSummary';
import PlatformPayments from '../pages/PlatformPayments';
import PlatformAudit from '../pages/PlatformAudit';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

const wrap = (ui, permissions = []) => render(
  <MemoryRouter><AuthContext.Provider value={{ user: { role: 'PLATFORM_OWNER', permissions } }}>{ui}</AuthContext.Provider></MemoryRouter>);
afterEach(() => vi.restoreAllMocks());

describe('PlatformNav', () => {
  const labels = () => screen.getAllByRole('link').map((a) => a.textContent);
  it('el dueño ve todas las secciones', () => {
    wrap(<PlatformNav />, ['ORG_VIEW', 'PAYMENT_VIEW', 'AUDIT_VIEW', 'TEAM_MANAGE']);
    expect(labels()).toEqual(['Resumen', 'Empresas', 'Cobros', 'Auditoría', 'Equipo']);
  });
  it('soporte no ve Cobros ni Equipo', () => {
    wrap(<PlatformNav />, ['ORG_VIEW', 'AUDIT_VIEW']);
    expect(labels()).toEqual(['Resumen', 'Empresas', 'Auditoría']);
  });
  it('consulta con cobros pero sin equipo', () => {
    wrap(<PlatformNav />, ['ORG_VIEW', 'PAYMENT_VIEW', 'AUDIT_VIEW']);
    expect(labels()).toEqual(['Resumen', 'Empresas', 'Cobros', 'Auditoría']);
  });
});

const summary = (over = {}) => ({
  organizations: { PENDING: 2, ACTIVE: 8, SUSPENDED: 1, CANCELLED: 0 },
  subscriptions: { TRIAL: 3, ACTIVE: 5, GRACE: 1, SUSPENDED: 1, CANCELLED: 0 },
  complimentary: 2, plans: { PRO: 4, STARTER: 3 }, newLast30Days: 6, trialWarningDays: 5,
  trialsEnding: [{ organizationId: 7, name: 'Ferretería Tornillo', planName: 'Pro', trialEndsAt: '2026-11-08T10:00:00', daysLeft: 1 }],
  inGrace: [{ organizationId: 9, name: 'Panadería Beta', planName: 'Starter', graceEndsAt: '2026-11-12T10:00:00' }],
  revenue: { thisMonth: { net: 1000000, iva: 190000, total: 1190000, count: 8 }, lastMonth: { net: 800000, iva: 152000, total: 952000, count: 6 },
    mrr: 640000, pendingCount: 2, pendingTotal: 285362, failedLast30Days: 1 },
  ...over,
});

describe('PlatformSummary', () => {
  it('muestra estados, ingresos con variación, MRR y las listas de pruebas y gracia', async () => {
    vi.spyOn(apiModule.API.platform, 'summary').mockResolvedValue(summary());
    wrap(<PlatformSummary />);
    expect(await screen.findByText('En prueba')).toBeInTheDocument();
    expect(screen.getByText('2 de cortesía')).toBeInTheDocument();
    expect(screen.getByText(/2 sin verificar el correo/)).toBeInTheDocument();
    const rev = within(screen.getByLabelText('Ingresos'));
    expect(rev.getByText(/8 cobros/)).toBeInTheDocument();
    expect(rev.getByText(/▲ 25% vs mes anterior/)).toBeInTheDocument();   // 1.190.000 vs 952.000
    expect(rev.getByText(/neto, sin IVA/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ferretería Tornillo' })).toHaveAttribute('href', '/platform/orgs/7');
    expect(screen.getByText('1 día')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Panadería Beta' })).toBeInTheDocument();
    expect(screen.getByText(/PRO/)).toBeInTheDocument();
  });

  it('sin permiso de cobros no hay ingresos y se avisa', async () => {
    vi.spyOn(apiModule.API.platform, 'summary').mockResolvedValue(summary({ revenue: null }));
    wrap(<PlatformSummary />);
    expect(await screen.findByText(/no incluye ver los ingresos/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ingresos')).toBeNull();
  });

  it('sin pruebas por vencer ni gracia muestra mensajes vacíos', async () => {
    vi.spyOn(apiModule.API.platform, 'summary').mockResolvedValue(summary({ trialsEnding: [], inGrace: [] }));
    wrap(<PlatformSummary />);
    expect(await screen.findByText(/ninguna prueba vence pronto/i)).toBeInTheDocument();
    expect(screen.getByText(/ninguna empresa en gracia/i)).toBeInTheDocument();
  });
});

const paymentsPage = (rows = []) => ({
  page: { content: rows, page: 0, size: 15, totalElements: rows.length, totalPages: 1 },
  totals: { paidNet: 300000, paidIva: 57000, paidTotal: 357000, paidCount: 2 },
});
const pay = (over = {}) => ({ id: 1, organizationId: 7, organizationName: 'Ferretería Alfa', planCode: 'PRO', planName: 'Pro', billingCycle: 'MONTHLY',
  provider: 'SIMULATED', amountNet: 100000, ivaAmount: 19000, amountTotal: 119000, status: 'PAID', createdByPlatform: false,
  createdAt: '2026-11-01T10:00:00', paidAt: '2026-11-01T10:05:00', ...over });

describe('PlatformPayments', () => {
  it('lista los cobros con su empresa, estado y los totales de lo pagado en el filtro', async () => {
    vi.spyOn(apiModule.API.platform, 'payments').mockResolvedValue(paymentsPage([pay(), pay({ id: 2, status: 'EXPIRED', organizationName: 'Beta', organizationId: 9 })]));
    wrap(<PlatformPayments />);
    expect(await screen.findByRole('link', { name: 'Ferretería Alfa' })).toHaveAttribute('href', '/platform/orgs/7');
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Pagado')).toBeInTheDocument();     // también existe como opción del filtro
    expect(table.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText(/pagado en este filtro \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('2 cobros')).toBeInTheDocument();
  });

  it('los filtros se envían al servidor y vuelven a la página 0', async () => {
    const spy = vi.spyOn(apiModule.API.platform, 'payments').mockResolvedValue(paymentsPage([pay()]));
    wrap(<PlatformPayments />);
    await screen.findByText('Ferretería Alfa');
    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: 'FAILED' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', page: 0 })));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', from: '2026-11-01' })));
    fireEvent.change(screen.getByPlaceholderText(/buscar empresa/i), { target: { value: 'alfa' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'alfa' })));
  });

  it('sin resultados lo dice', async () => {
    vi.spyOn(apiModule.API.platform, 'payments').mockResolvedValue(paymentsPage([]));
    wrap(<PlatformPayments />);
    expect(await screen.findByText(/sin cobros con estos filtros/i)).toBeInTheDocument();
  });
});

const auditPage = (rows = []) => ({ content: rows, page: 0, size: 20, totalElements: rows.length, totalPages: 1 });
const row = (over = {}) => ({ id: 1, at: '2026-11-05T10:00:00', action: 'PLAN_CHANGED', actor: 'dueno@x.com', organizationId: 7,
  organizationName: 'Ferretería Alfa', details: 'plan=PRO cortesía=false', ...over });

describe('PlatformAudit', () => {
  it('muestra las acciones en español, quién las hizo, la empresa enlazada y el detalle', async () => {
    vi.spyOn(apiModule.API.platform, 'audit').mockResolvedValue(auditPage([row(), row({ id: 2, action: 'TEAM_MEMBER_CREATED', organizationId: null, organizationName: null, details: 'ana@x.com' })]));
    wrap(<PlatformAudit />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Plan cambiado')).toBeInTheDocument();
    expect(table.getByText('Miembro del equipo agregado')).toBeInTheDocument();
    expect(table.getByRole('link', { name: 'Ferretería Alfa' })).toHaveAttribute('href', '/platform/orgs/7');
    expect(table.getByText('plan=PRO cortesía=false')).toBeInTheDocument();
  });

  it('una acción desconocida se muestra tal cual y los filtros van al servidor', async () => {
    const spy = vi.spyOn(apiModule.API.platform, 'audit').mockResolvedValue(auditPage([row({ action: 'ALGO_NUEVO' })]));
    wrap(<PlatformAudit />);
    expect(await screen.findByText('ALGO_NUEVO')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/filtrar por acción/i), { target: { value: 'PLAN_CHANGED' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'PLAN_CHANGED', page: 0 })));
    fireEvent.change(screen.getByPlaceholderText(/quién/i), { target: { value: 'ana' } });
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ actor: 'ana' })));
  });
});
