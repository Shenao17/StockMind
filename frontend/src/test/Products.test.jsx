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

const envelope = (content, extra = {}) => ({
  content, page: 0, size: 10, totalElements: content.length, totalPages: 1, ...extra,
});

function renderProducts({ isAdmin = false, list } = {}) {
  const listSpy = vi.spyOn(apiModule.API.products, 'list')
    .mockImplementation(list || (async () => envelope(mockProducts)));
  vi.spyOn(apiModule.API.categories, 'list').mockResolvedValue([
    { id: 1, name: 'Electrónica' }, { id: 2, name: 'Mobiliario' },
  ]);
  const utils = render(
    <MemoryRouter>
      <AuthContext.Provider value={{ isAdmin: () => isAdmin, user: { username: 'test', role: isAdmin ? 'ADMIN' : 'SELLER' } }}>
        <Products showToast={vi.fn()} />
      </AuthContext.Provider>
    </MemoryRouter>
  );
  return { ...utils, listSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect(screen.getAllByText('CRÍTICO').length).toBeGreaterThan(0);
  });

  it('muestra badge OK en productos con stock suficiente', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0);
  });

  it('pide al servidor la primera página con tamaño fijo', async () => {
    const { listSpy } = renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 0, size: 10 }));
  });

  it('muestra el total de productos que informa el servidor', async () => {
    renderProducts({ list: async () => envelope(mockProducts, { totalElements: 57, totalPages: 6 }) });
    expect(await screen.findByText('57 productos')).toBeInTheDocument();
  });
});

describe('Products — buscador (en el servidor)', () => {
  it('envía el texto al servidor tras una breve pausa, y vuelve a la página 0', async () => {
    const { listSpy } = renderProducts();
    await screen.findByText('Mouse Inalámbrico');

    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o sku/i), {
      target: { value: 'mouse' },
    });

    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'mouse', page: 0 }))
    );
  });

  it('no consulta en cada tecla (debounce)', async () => {
    const { listSpy } = renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    const callsBefore = listSpy.mock.calls.length;

    const input = screen.getByPlaceholderText(/buscar por nombre o sku/i);
    fireEvent.change(input, { target: { value: 'm' } });
    fireEvent.change(input, { target: { value: 'mo' } });
    fireEvent.change(input, { target: { value: 'mou' } });

    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(listSpy.mock.calls.length - callsBefore).toBe(1);
  });

  it('muestra mensaje cuando el servidor no devuelve resultados', async () => {
    renderProducts({
      list: async (params) => (params.search ? envelope([]) : envelope(mockProducts)),
    });
    await screen.findByText('Mouse Inalámbrico');

    fireEvent.change(screen.getByPlaceholderText(/buscar por nombre o sku/i), {
      target: { value: 'zzzznotexiste' },
    });

    expect(await screen.findByText(/sin resultados para/i)).toBeInTheDocument();
  });

  it('filtra por categoría en el servidor', async () => {
    const { listSpy } = renderProducts();
    await screen.findByText('Mouse Inalámbrico');

    fireEvent.change(screen.getByLabelText(/filtrar por categoría/i), { target: { value: '2' } });

    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: '2', page: 0 }))
    );
  });
});

describe('Products — paginación', () => {
  const pages = (page) => envelope(mockProducts, { page, totalElements: 30, totalPages: 3 });

  it('muestra los controles cuando hay más de una página', async () => {
    renderProducts({ list: async (p) => pages(p.page) });
    expect(await screen.findByText(/página 1 de 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled();
  });

  it('no muestra controles si todo cabe en una página', async () => {
    renderProducts();
    await screen.findByText('Mouse Inalámbrico');
    expect(screen.queryByRole('navigation', { name: /paginación/i })).not.toBeInTheDocument();
  });

  it('pide la página siguiente al hacer clic en Siguiente', async () => {
    const { listSpy } = renderProducts({ list: async (p) => pages(p.page) });
    await screen.findByText(/página 1 de 3/i);

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
    );
    expect(await screen.findByText(/página 2 de 3/i)).toBeInTheDocument();
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
