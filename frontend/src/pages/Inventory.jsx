import { useEffect, useState } from 'react';
import { API } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';

const TYPE_LABELS = {
  ENTRY:      { label: 'Entrada',     cls: 'badge-success' },
  EXIT:       { label: 'Salida',      cls: 'badge-danger'  },
  SALE:       { label: 'Venta',       cls: 'badge-accent'  },
  ADJUSTMENT: { label: 'Ajuste',      cls: 'badge-warning' },
  RETURN:     { label: 'Devolución',  cls: 'badge-muted'   },
};

const emptyForm = { productId: '', type: 'ENTRY', quantity: '', reason: '' };

export default function Inventory({ showToast }) {
  const { isAdmin } = useAuth();
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadMovements(); }, []);

  async function loadMovements() {
    try {
      const data = await API.inventory.movements() || [];
      setMovements(data);
    } catch (e) {
      showToast?.('Error cargando movimientos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function openModal() {
    const prods = await API.products.list() || [];
    setProducts(prods);
    setForm(emptyForm);
    setModalOpen(true);
  }

  async function saveMovement() {
    if (!form.productId || !form.quantity || parseInt(form.quantity) < 1) {
      showToast?.('Complete los campos obligatorios', 'warning'); return;
    }
    try {
      await API.inventory.register({ productId: parseInt(form.productId), type: form.type, quantity: parseInt(form.quantity), reason: form.reason });
      showToast?.('Movimiento registrado correctamente');
      setModalOpen(false);
      loadMovements();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <>
      <div className="table-container">
        <div className="table-header"><h2>Historial de Movimientos</h2></div>
        {loading ? (
          <div className="loading-state"><div className="spinner" /> Cargando...</div>
        ) : movements.length === 0 ? (
          <div className="loading-state">Sin movimientos registrados</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Producto</th><th>Tipo</th><th>Cantidad</th>
                <th>Stock antes</th><th>Stock después</th><th>Motivo</th><th>Usuario</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => {
                const type = TYPE_LABELS[m.type] || { label: m.type, cls: 'badge-muted' };
                return (
                  <tr key={m.id}>
                    <td className="mono">{m.id}</td>
                    <td>{m.product?.name || '—'}</td>
                    <td><span className={`badge ${type.cls}`}>{type.label}</span></td>
                    <td className="mono" style={{ color: m.quantity > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </td>
                    <td className="mono">{m.stockBefore}</td>
                    <td className="mono">{m.stockAfter}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--text-dim)' }}>{m.reason || '—'}</td>
                    <td className="mono">{m.user?.username || '—'}</td>
                    <td className="mono">{new Date(m.createdAt).toLocaleString('es-CO')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar Movimiento de Inventario"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveMovement}>Registrar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Producto *</label>
          <select value={form.productId} onChange={f('productId')}>
            <option value="">Seleccionar producto...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockCurrent})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Tipo de movimiento *</label>
          <select value={form.type} onChange={f('type')}>
            <option value="ENTRY">Entrada (compra / recepción)</option>
            <option value="EXIT">Salida (merma / pérdida)</option>
            <option value="ADJUSTMENT">Ajuste por conteo físico</option>
            <option value="RETURN">Devolución de cliente</option>
          </select>
        </div>
        <div className="form-group">
          <label>Cantidad *</label>
          <input type="number" value={form.quantity} onChange={f('quantity')} min="1" placeholder="0" />
        </div>
        <div className="form-group">
          <label>Motivo / Observación</label>
          <input type="text" value={form.reason} onChange={f('reason')} placeholder="Opcional: describe el movimiento" />
        </div>
      </Modal>
    </>
  );
}
