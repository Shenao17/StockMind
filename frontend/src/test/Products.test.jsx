import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Products from '../pages/Products';
import { AuthContext } from '../context/AuthContext';
import * as apiModule from '../api';

// ── Mock de productos de ejemplo ──────────────────────────
const mockProducts = [
  { id: 1, name: 'Mouse Inalámbrico', sku: 'ELEC-001', price: 45000, stockCurrent: 10, stockMinimum: 5, unit: 'UNIT', category: { id: 1, name: 'Electrónica' } },
  { id: 2, name: 'Teclado Mecánico',  sku: 'ELEC-002', price: 89000, stockCurrent: 3,  stockMinimum: 5, unit: 'UNIT', category: { id: 1, name: 'Electrónica' } },
  { id: 3, name: 'Silla Ergonómica',  sku: 'MOB-001',  price: 320000, stockCurrent: 8, stockMinimum: 2, unit: 'UNIT', category: { id: 2, name: 'Mobiliario' } },
];

function renderProducts({ isAdmin = false } = {}) {
  vi.spyOn(apiModule.API.products, 'list').mockResolvedValue(mockProducts);
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ isAdmin: () => isAdmin, user: { username: 'test', role: isAdmin ? 'ADMIN' : 'SELLER' } }}>
        <Products showToast={vi.fn()} />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('Products — renderizado', () => {
  it('muestra el título del catálogo', async () => {
    renderProducts();
    expect(await screen.findByText(/catálogo de productos/i)).toBeInTheDocument();
  });

  it('renderiza todos los productos cargados', async () => {
    renderProducts();
    expect(await screen.findByText('Mouse Inalámbrico')).toBeInTheDocument();
    expect(screen.getByText('Teclado Mecánico')).toBeInTheDocument();
    expect(screen.getByText('Silla Ergonómica')).toBeInTheDocument();
  });

  it('muestra badge CRÍTICO en productos con stock bajo el mínimo', async () => {
    renderProducts();
    await screen.findByText('Teclado Mecánico');
    const badges = screen.getAllByText('CRÍTICO');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('muestra badge OK en productos con stock suficiente', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    const badges = screen.getAllByText('OK');
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe('Products — buscador', () => {
  it('filtra productos por nombre', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o sku/i), {
      target: { value: 'mouse' },
    });
    expect(screen.getByText('Mouse Inalámbrico')).toBeInTheDocument();
    expect(screen.queryByText('Teclado Mecánico')).not.toBeInTheDocument();
    expect(screen.queryByText('Silla Ergonómica')).not.toBeInTheDocument();
  });

  it('filtra productos por SKU', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o sku/i), {
      target: { value: 'MOB-001' },
    });
    expect(screen.getByText('Silla Ergonómica')).toBeInTheDocument();
    expect(screen.queryByText('Mouse Inalámbrico')).not.toBeInTheDocument();
  });

  it('muestra mensaje cuando no hay resultados', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o sku/i), {
      target: { value: 'zzzznotexiste' },
    });
    expect(screen.getByText(/sin resultados para/i)).toBeInTheDocument();
  });

  it('restaura todos los productos al borrar la búsqueda', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    const input = screen.getByPlaceholderText(/buscar por nombre o sku/i);
    fireEvent.change(input, { target: { value: 'mouse' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('Mouse Inalámbrico')).toBeInTheDocument();
    expect(screen.getByText('Teclado Mecánico')).toBeInTheDocument();
    expect(screen.getByText('Silla Ergonómica')).toBeInTheDocument();
  });
});

describe('Products — permisos', () => {
  it('NO muestra botón nuevo producto si el usuario es vendedor', async () => {
    renderProducts({ isAdmin: false });
    await screen.findByText('Mouse Inalámbrico');
    expect(screen.queryByRole('button', { name: /nuevo producto/i })).not.toBeInTheDocument();
  });

  it('SÍ muestra botón nuevo producto si el usuario es admin', async () => {
    renderProducts({ isAdmin: true });
    expect(await screen.findByRole('button', { name: /nuevo producto/i })).toBeInTheDocument();
  });

  it('NO muestra columna de acciones si el usuario es vendedor', async () => {
    renderProducts({ isAdmin: false });
    await screen.findByText('Mouse Inalámbrico');
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('SÍ muestra botones editar y eliminar si el usuario es admin', async () => {
    renderProducts({ isAdmin: true });
    await screen.findByText('Mouse Inalámbrico');
    const editBtns = screen.getAllByRole('button', { name: /editar/i });
    expect(editBtns.length).toBe(mockProducts.length);
  });
});
