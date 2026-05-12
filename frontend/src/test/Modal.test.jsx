import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Modal from '../components/ui/Modal';

describe('Modal — visibilidad', () => {
  it('no renderiza nada cuando open es false', () => {
    render(<Modal open={false} onClose={vi.fn()} title="Test" />);
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('renderiza el título cuando open es true', () => {
    render(<Modal open={true} onClose={vi.fn()} title="Nuevo Producto" />);
    expect(screen.getByText('Nuevo Producto')).toBeInTheDocument();
  });

  it('renderiza el contenido hijo correctamente', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        <p>Contenido del modal</p>
      </Modal>
    );
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument();
  });

  it('renderiza el footer cuando se pasa', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test" footer={<button>Guardar</button>}>
        <p>Contenido</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
  });
});

describe('Modal — interacción', () => {
  it('llama a onClose al hacer click en el overlay', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="Test"><p>contenido</p></Modal>);
    fireEvent.click(screen.getByText('contenido').closest('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
