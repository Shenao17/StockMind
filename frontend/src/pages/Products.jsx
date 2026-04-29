import { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';

const UNITS = ['UNIT', 'KG', 'LT', 'BOX'];
const UNIT_LABELS = { UNIT: 'Unidad', KG: 'Kilogramo', LT: 'Litro', BOX: 'Caja' };

const emptyForm = { name: '', sku: '', price: '', stockCurrent: 0, stockMinimum: 5, unit: 'UNIT', categoryId: '', description: '' };

export default function Products({ showToast }) {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
  }, [search, products]);

  async function loadProducts() {
    try {
      const data = await API.products.list() || [];
      setProducts(data);
      setFiltered(data);
      const cats = [...new Map(data.map(p => [p.category?.id, p.category])).values()].filter(Boolean);
      setCategories(cats);
    } catch (e) {
      showToast?.('Error cargando productos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openModal(product = null) {
    if (product) {
      setEditId(product.id);
      setForm({
        name: product.name, sku: product.sku, price: product.price,
        stockCurrent: product.stockCurrent, stockMinimum: product.stockMinimum,
        unit: product.unit, categoryId: product.category?.id || '', description: product.description || '',
      });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setModalOpen(true);
  }

  async function saveProduct() {
    const data = { ...form, price: parseFloat(form.price), stockCurrent: parseInt(form.stockCurrent), stockMinimum: parseInt(form.stockMinimum) };
    if (!data.name || !data.sku || !data.categoryId || isNaN(data.price)) {
      showToast?.('Complete los campos obligatorios', 'warning'); return;
    }
    try {
      if (editId) {
        await API.products.update(editId, data);
        showToast?.('Producto actualizado correctamente');
      } else {
        await API.products.create(data);
        showToast?.('Producto creado correctamente');
      }
      setModalOpen(false);
      loadProducts();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function deleteProduct(id) {
    if (!confirm('¿Desactivar este producto? Ya no aparecerá en el catálogo.')) return;
    try {
      await API.products.remove(id);
      showToast?.('Producto desactivado');
      loadProducts();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando productos...</div>;

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h2>Catálogo de Productos</h2>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{filtered.length} productos</span>
        </div>
        {loading ? (
          <div className="loading-state"><div className="spinner" /> Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="loading-state">Sin resultados</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th>
                {isAdmin() && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className="mono">{p.sku}</td>
                  <td>{p.category?.name || '—'}</td>
                  <td className="mono">{fmt(p.price)}</td>
                  <td>
                    <span style={{ color: p.stockCurrent <= p.stockMinimum ? 'var(--danger)' : 'var(--text)' }}>{p.stockCurrent}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}> / min {p.stockMinimum}</span>
                  </td>
                  <td>
                    {p.stockCurrent <= p.stockMinimum
                      ? <span className="badge badge-danger">CRÍTICO</span>
                      : <span className="badge badge-success">OK</span>}
                  </td>
                  {isAdmin() && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openModal(p)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteProduct(p.id)}>Eliminar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar Producto' : 'Nuevo Producto'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveProduct}>Guardar</button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Nombre del producto *</label>
            <input type="text" value={form.name} onChange={f('name')} placeholder="Ej: Mouse Inalámbrico" />
          </div>
          <div className="form-group">
            <label>SKU *</label>
            <input type="text" value={form.sku} onChange={f('sku')} placeholder="Ej: ELEC-001" />
          </div>
          <div className="form-group">
            <label>Precio (COP) *</label>
            <input type="number" value={form.price} onChange={f('price')} min="0" step="100" placeholder="0" />
          </div>
          <div className="form-group">
            <label>Stock inicial</label>
            <input type="number" value={form.stockCurrent} onChange={f('stockCurrent')} min="0" />
          </div>
          <div className="form-group">
            <label>Stock mínimo</label>
            <input type="number" value={form.stockMinimum} onChange={f('stockMinimum')} min="0" />
          </div>
          <div className="form-group">
            <label>Unidad</label>
            <select value={form.unit} onChange={f('unit')}>
              {UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Categoría *</label>
            <select value={form.categoryId} onChange={f('categoryId')}>
              <option value="">Seleccionar...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Descripción</label>
            <textarea value={form.description} onChange={f('description')} rows="2" placeholder="Descripción opcional" />
          </div>
        </div>
      </Modal>
    </>
  );
}
