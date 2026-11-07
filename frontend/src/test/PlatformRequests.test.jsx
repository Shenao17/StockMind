import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import PlatformRequests from '../pages/PlatformRequests';
import PlatformPlans from '../pages/PlatformPlans';
import RequestModal from '../components/RequestModal';
import PlatformNav from '../components/PlatformNav';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

const wrap = (ui, user) => render(<MemoryRouter><AuthContext.Provider value={{ user }}>{ui}</AuthContext.Provider></MemoryRouter>);
const OWNER = { email: 'dueno@x.com', role: 'PLATFORM_OWNER', permissions: ['REQUEST_REVIEW', 'REQUEST_CREATE', 'PLANS_MANAGE'] };
const SUPPORT = { email: 'ana@x.com', role: 'PLATFORM_SUPPORT', permissions: ['REQUEST_CREATE'] };
afterEach(() => vi.restoreAllMocks());

const reqRow = (over = {}) => ({ id: 5, type: 'CHANGE_PLAN', organizationId: 7, organizationName: 'Ferretería Alfa',
  params: { planCode: 'STARTER', billingCycle: 'YEARLY' }, reason: 'El cliente lo pidió por teléfono', status: 'PENDING',
  requestedBy: 'ana@x.com', createdAt: '2026-11-05T10:00:00', decidedBy: null, decidedAt: null, decisionNote: null, ...over });
const page = (rows) => ({ content: rows, page: 0, size: 15, totalElements: rows.length, totalPages: 1 });

describe('PlatformRequests — dueño', () => {
  it('lista las pendientes con empresa, acción, detalle, motivo y quién pidió', async () => {
    const spy = vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue(page([reqRow()]));
    wrap(<PlatformRequests />, OWNER);
    expect(await screen.findByText('Cambiar plan')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    expect(screen.getByText('Plan STARTER (anual)')).toBeInTheDocument();
    expect(screen.getByText('El cliente lo pidió por teléfono')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ferretería Alfa' })).toHaveAttribute('href', '/platform/orgs/7');
    expect(screen.getByRole('heading', { name: /solicitudes del equipo/i })).toBeInTheDocument();
  });

  it('aprobar pide el PIN: uno malo se avisa y reintenta; el bueno ejecuta', async () => {
    vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue(page([reqRow()]));
    const approve = vi.spyOn(apiModule.API.platform, 'approveRequest')
      .mockRejectedValueOnce(Object.assign(new Error('PIN incorrecto'), { code: 'PIN_INVALID' }))
      .mockResolvedValueOnce({});
    wrap(<PlatformRequests />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /aprobar/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    expect(await screen.findByText('PIN incorrecto')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(approve).toHaveBeenLastCalledWith(5, '482915'));
  });

  it('si la acción falla al ejecutarse se avisa el error y la solicitud queda pendiente', async () => {
    vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue(page([reqRow()]));
    vi.spyOn(apiModule.API.platform, 'approveRequest').mockRejectedValue(new Error('Ya existe una empresa con el NIT 900'));
    const toast = vi.fn();
    wrap(<PlatformRequests showToast={toast} />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /aprobar/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('No se pudo ejecutar: Ya existe una empresa con el NIT 900', 'error'));
  });

  it('rechazar exige un motivo', async () => {
    vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue(page([reqRow()]));
    const reject = vi.spyOn(apiModule.API.platform, 'rejectRequest').mockResolvedValue({});
    wrap(<PlatformRequests />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /rechazar/i }));
    const dialog = await waitFor(() => { const el = document.querySelector('.modal'); if (!el) throw new Error('x'); return el; });
    fireEvent.click(within(dialog).getByRole('button', { name: /^rechazar$/i }));
    expect(await screen.findByText(/mínimo 5 caracteres/i)).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/motivo del rechazo/i), { target: { value: 'El cliente aún debe saldo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^rechazar$/i }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith(5, 'El cliente aún debe saldo'));
  });
});

describe('PlatformRequests — miembro del equipo', () => {
  it('ve sus solicitudes, sin aprobar ni rechazar, y puede cancelar las pendientes propias', async () => {
    vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue(page([
      reqRow(), reqRow({ id: 6, status: 'REJECTED', decidedBy: 'dueno@x.com', decisionNote: 'Aún tiene saldo' }),
    ]));
    const cancel = vi.spyOn(apiModule.API.platform, 'cancelRequest').mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    wrap(<PlatformRequests />, SUPPORT);
    expect(await screen.findByRole('heading', { name: /mis solicitudes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprobar/i })).toBeNull();
    expect(screen.getByText(/por dueno@x.com · Aún tiene saldo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(5));
  });
});

describe('RequestModal', () => {
  const org = { id: 7, name: 'Ferretería Alfa', subscription: { planCode: 'PRO', billingCycle: 'MONTHLY' } };
  const setup = (type = 'SUSPEND') => {
    vi.spyOn(apiModule.API.public, 'plans').mockResolvedValue([{ code: 'STARTER', name: 'Starter' }, { code: 'PRO', name: 'Pro' }]);
    const create = vi.spyOn(apiModule.API.platform, 'createRequest').mockResolvedValue({});
    const onClose = vi.fn();
    render(<RequestModal open org={org} initialType={type} onClose={onClose} showToast={vi.fn()} />);
    return { create, onClose };
  };

  it('exige un motivo de al menos 10 caracteres', async () => {
    const { create } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /enviar solicitud/i }));
    expect(await screen.findByText(/mínimo 10 caracteres/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('envía el tipo, la empresa, el motivo y los parámetros de un cambio de plan', async () => {
    const { create, onClose } = setup('CHANGE_PLAN');
    await screen.findByLabelText('Plan');
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'STARTER' } });
    fireEvent.change(screen.getByLabelText('Ciclo'), { target: { value: 'YEARLY' } });
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'El cliente pidió bajar de plan' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ type: 'CHANGE_PLAN', organizationId: 7,
      reason: 'El cliente pidió bajar de plan', params: { planCode: 'STARTER', billingCycle: 'YEARLY', complimentary: false } }));
    expect(onClose).toHaveBeenCalled();
  });

  it('extender prueba envía los días como número y corregir NIT envía el NIT', async () => {
    const { create } = setup('EXTEND_TRIAL');
    fireEvent.change(await screen.findByLabelText(/días a sumar/i), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'Pidió más tiempo para evaluar' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTEND_TRIAL', params: { days: 45 } })));
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'CHANGE_TAX_ID' } });
    fireEvent.change(screen.getByLabelText('Nuevo NIT'), { target: { value: '900555666-1' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'CHANGE_TAX_ID', params: { taxId: '900555666-1' } })));
  });

  it('un error del servidor (p. ej. duplicada) se muestra y no cierra', async () => {
    const { create, onClose } = setup();
    create.mockRejectedValue(new Error('Ya hay una solicitud pendiente de este tipo para esta empresa'));
    fireEvent.change(await screen.findByLabelText(/motivo/i), { target: { value: 'Lo pidió el cliente hoy mismo' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }));
    expect(await screen.findByText(/ya hay una solicitud pendiente/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PlatformPlans', () => {
  const plan = (over = {}) => ({ code: 'PRO', name: 'Pro', priceMonthly: 119900, priceYearly: 1199000, maxUsers: 5, maxProducts: 3000,
    extraUserPrice: 15000, active: true, sortOrder: 2, features: ['REPORTS', 'PREDICTIONS'], subscribers: 4, ...over });

  it('lista los planes con precios, límites, funciones y empresas', async () => {
    vi.spyOn(apiModule.API.platform, 'plans').mockResolvedValue([plan(), plan({ code: 'OLD', name: 'Viejo', active: false, subscribers: 0, features: [] })]);
    wrap(<PlatformPlans />, OWNER);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Reportes, Predicciones')).toBeInTheDocument();
    expect(table.getByText('Inactivo')).toBeInTheDocument();
  });

  it('editar: avisa el impacto, pide el PIN y envía todos los campos con números', async () => {
    vi.spyOn(apiModule.API.platform, 'plans').mockResolvedValue([plan()]);
    const upd = vi.spyOn(apiModule.API.platform, 'updatePlan').mockResolvedValue({});
    wrap(<PlatformPlans />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /editar/i }));
    expect(await screen.findByText(/4 empresa\(s\) usan este plan/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensual'), { target: { value: '129900' } });
    fireEvent.click(screen.getByLabelText('Exportar'));                       // agrega una función
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith('PRO', { name: 'Pro', active: true, features: ['REPORTS', 'PREDICTIONS', 'EXPORT'],
      pin: '482915', priceMonthly: 129900, priceYearly: 1199000, maxUsers: 5, maxProducts: 3000, extraUserPrice: 15000 }));
  });

  it('ayuda a decidir: muestra el ahorro del plan anual, avisa si supera 12 meses y marca lo que aún no existe', async () => {
    vi.spyOn(apiModule.API.platform, 'plans').mockResolvedValue([plan()]);
    wrap(<PlatformPlans />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /editar/i }));
    expect(await screen.findByText(/ahorro de \$ 239\.800 al año \(≈ 2 meses gratis\)/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Anual'), { target: { value: '1500000' } });
    expect(screen.getByText(/no puede superar 12 meses/i)).toBeInTheDocument();

    // Exportar, Asistente IA y API aún no están construidos: se avisa al marcarlos
    expect(screen.queryByText(/aún no están construidas/i)).toBeNull();
    fireEvent.click(screen.getByLabelText('Asistente IA'));
    expect(screen.getByText(/aún no están construidas/i)).toBeInTheDocument();
    expect(screen.getAllByText('Próximamente')).toHaveLength(3);
  });

  it('el interruptor de activo cambia el texto que explica qué pasa', async () => {
    vi.spyOn(apiModule.API.platform, 'plans').mockResolvedValue([plan()]);
    wrap(<PlatformPlans />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /editar/i }));
    expect(await screen.findByText('Plan activo')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Activo'));
    expect(screen.getByText('Plan inactivo')).toBeInTheDocument();
    expect(screen.getByText(/las empresas que ya lo tienen lo conservan/i)).toBeInTheDocument();
  });

  it('un error de validación del servidor vuelve al formulario para corregir', async () => {
    vi.spyOn(apiModule.API.platform, 'plans').mockResolvedValue([plan()]);
    vi.spyOn(apiModule.API.platform, 'updatePlan').mockRejectedValue(new Error('El precio anual no puede superar 12 meses del precio mensual'));
    wrap(<PlatformPlans />, OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /editar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /continuar/i }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482915' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    expect(await screen.findByText(/no puede superar 12 meses/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del plan')).toBeInTheDocument();
  });
});

describe('PlatformNav — solicitudes y planes', () => {
  it('el dueño ve Solicitudes con el número de pendientes y Planes', async () => {
    vi.spyOn(apiModule.API.platform, 'requests').mockResolvedValue({ content: [], totalElements: 3, totalPages: 3, page: 0, size: 1 });
    wrap(<PlatformNav />, { ...OWNER, permissions: ['REQUEST_REVIEW', 'REQUEST_CREATE', 'PLANS_MANAGE'] });
    expect(await screen.findByLabelText('3 pendientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /planes/i })).toBeInTheDocument();
  });

  it('el contador se actualiza cuando una pantalla avisa que cambió una solicitud', async () => {
    const spy = vi.spyOn(apiModule.API.platform, 'requests')
      .mockResolvedValueOnce({ content: [], totalElements: 2, totalPages: 2, page: 0, size: 1 })
      .mockResolvedValue({ content: [], totalElements: 1, totalPages: 1, page: 0, size: 1 });
    wrap(<PlatformNav />, OWNER);
    expect(await screen.findByLabelText('2 pendientes')).toBeInTheDocument();
    window.dispatchEvent(new Event('platform:requests-changed'));
    expect(await screen.findByLabelText('1 pendientes')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('soporte ve Solicitudes sin contador y sin Planes', () => {
    const spy = vi.spyOn(apiModule.API.platform, 'requests');
    wrap(<PlatformNav />, SUPPORT);
    expect(screen.getByRole('link', { name: /solicitudes/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /planes/i })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
