import { render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { labelTables, useTableLabels } from '../hooks/useTableLabels';

function Demo() {
  useTableLabels();
  const [rows, setRows] = useState([{ n: 'Cemento', s: 'CEM-1' }]);
  return (
    <div className="table-container">
      <table>
        <thead><tr><th>Producto</th><th>Código</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.s}><td>{r.n}</td><td>{r.s}</td><td><button>Editar</button></td></tr>)}</tbody>
      </table>
      <button onClick={() => setRows((p) => [...p, { n: 'Pintura', s: 'PIN-2' }])}>agregar</button>
      
    </div>
  );
}

describe('useTableLabels', () => {
  it('pone en cada celda el nombre de su columna (la columna sin título queda vacía)', async () => {
    const { container } = render(<Demo />);
    await waitFor(() => expect(container.querySelector('tbody td')).toHaveAttribute('data-label', 'Producto'));
    const cells = container.querySelectorAll('tbody tr')[0].children;
    expect([...cells].map((c) => c.getAttribute('data-label'))).toEqual(['Producto', 'Código', '']);
  });

  it('etiqueta también las filas que aparecen después', async () => {
    const { container, getByText } = render(<Demo />);
    await waitFor(() => expect(container.querySelectorAll('tbody tr')[0].children[1]).toHaveAttribute('data-label', 'Código'));
    getByText('agregar').click();
    const first = container.querySelector('table');
    await waitFor(() => {
      expect(first.querySelectorAll('tbody tr')).toHaveLength(2);
      expect(first.querySelectorAll('tbody tr')[1].children[0]).toHaveAttribute('data-label', 'Producto');
    });
  });

  it('labelTables ignora tablas sin encabezado y no falla con celdas de más', () => {
    document.body.innerHTML = '<div class="table-container"><table><tbody><tr><td>a</td></tr></tbody></table><table><thead><tr><th>Uno</th></tr></thead><tbody><tr><td>a</td><td>extra</td></tr></tbody></table></div>';
    labelTables();
    const [t1, t2] = document.querySelectorAll('table');
    expect(t1.querySelector('td')).not.toHaveAttribute('data-label');
    expect(t2.querySelectorAll('td')[0]).toHaveAttribute('data-label', 'Uno');
    expect(t2.querySelectorAll('td')[1]).toHaveAttribute('data-label', '');
  });
});
