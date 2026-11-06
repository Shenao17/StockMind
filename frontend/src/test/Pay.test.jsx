import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import Pay from '../pages/Pay';
import * as apiModule from '../api';

const base = {
  reference: 'ref-123', status: 'PENDING', planCode: 'PRO', planName: 'Pro', billingCycle: 'MONTHLY',
  amountNet: 119900, ivaAmount: 22781, amountTotal: 142681, canSimulate: true, company: 'Ferretería El Tornillo',
};

function renderPay() {
  return render(
    <MemoryRouter initialEntries={['/pay/ref-123']}>
      <Routes><Route path="/pay/:reference" element={<Pay />} /></Routes>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Pay', () => {
  it('muestra empresa, plan y el desglose con IVA', async () => {
    vi.spyOn(apiModule.API.public, 'payment').mockResolvedValue(base);
    renderPay();
    expect(await screen.findByText('Ferretería El Tornillo')).toBeInTheDocument();
    expect(screen.getByText(/plan pro · mensual/i)).toBeInTheDocument();
    expect(screen.getByText(/\$\s?142\.681/)).toBeInTheDocument();
    expect(screen.getByText(/\$\s?22\.781/)).toBeInTheDocument();
  });

  it('con la pasarela de pruebas permite simular el pago y confirma', async () => {
    vi.spyOn(apiModule.API.public, 'payment').mockResolvedValue(base);
    const sim = vi.spyOn(apiModule.API.public, 'simulatePayment').mockResolvedValue({ ...base, status: 'PAID', canSimulate: false });
    renderPay();
    fireEvent.click(await screen.findByRole('button', { name: /simular pago/i }));
    await waitFor(() => expect(sim).toHaveBeenCalledWith('ref-123'));
    expect(await screen.findByText(/pago recibido/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a stockmind/i })).toHaveAttribute('href', '/');
  });

  it('sin pasarela de pruebas no ofrece el botón', async () => {
    vi.spyOn(apiModule.API.public, 'payment').mockResolvedValue({ ...base, canSimulate: false });
    renderPay();
    await screen.findByText('Ferretería El Tornillo');
    expect(screen.queryByRole('button', { name: /simular pago/i })).not.toBeInTheDocument();
    expect(screen.getByText(/esperando la confirmación/i)).toBeInTheDocument();
  });

  it('enlace vencido', async () => {
    vi.spyOn(apiModule.API.public, 'payment').mockResolvedValue({ ...base, status: 'EXPIRED', canSimulate: false });
    renderPay();
    expect(await screen.findByText(/enlace de pago venció/i)).toBeInTheDocument();
  });

  it('referencia inexistente', async () => {
    vi.spyOn(apiModule.API.public, 'payment').mockRejectedValue(new Error('Pago no encontrado'));
    renderPay();
    expect(await screen.findByRole('alert')).toHaveTextContent(/pago no encontrado/i);
  });
});
