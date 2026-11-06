import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Pagination from '../components/ui/Pagination';

describe('Pagination', () => {
  it('no se dibuja con una sola página', () => {
    const { container } = render(<Pagination page={0} totalPages={1} totalElements={5} onPage={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no se dibuja sin páginas', () => {
    const { container } = render(<Pagination page={0} totalPages={0} totalElements={0} onPage={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra la página en base 1 y el total de registros', () => {
    render(<Pagination page={1} totalPages={4} totalElements={37} onPage={vi.fn()} />);
    expect(screen.getByText(/página 2 de 4/i)).toBeInTheDocument();
    expect(screen.getByText(/37 registros/i)).toBeInTheDocument();
  });

  it('desactiva Anterior en la primera página', () => {
    render(<Pagination page={0} totalPages={3} totalElements={30} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled();
  });

  it('desactiva Siguiente en la última página', () => {
    render(<Pagination page={2} totalPages={3} totalElements={30} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /anterior/i })).toBeEnabled();
  });

  it('llama a onPage con la página anterior y la siguiente (base 0)', () => {
    const onPage = vi.fn();
    render(<Pagination page={1} totalPages={3} totalElements={30} onPage={onPage} />);
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPage).toHaveBeenNthCalledWith(1, 0);
    expect(onPage).toHaveBeenNthCalledWith(2, 2);
  });
});
