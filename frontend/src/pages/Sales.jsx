import { useEffect, useState } from 'react';
import { API, fmt, fmtDate } from '../api';

export default function Sales({ showToast }) {
  const [view, setView] = useState('nueva'); // 'nueva' | 'historial'
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [salesHistory, setSalesHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    const q = productSearch.toLowerCase();
    setProducts(allProducts.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
  }, [productSearch, allProducts]);

  async function loadProducts() {
    try {
      const data = (await API.products.list() || []).filter(p => p.stockCurrent > 0);
      setAllProducts(data);
      setProducts(data);
    } catch (e) {
      showToast?.('Error cargando productos: ' + e.message, 'error');
    }
  }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockCurrent) { showToast?.('Stock máximo alcanzado', 'warning'); return prev; }
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function changeQty(productId, delta) {
    setCart(prev => {
      return prev.map(i => {
        if (i.product.id !== productId) return i;
        const newQty = i.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > i.product.stockCurrent) { showToast?.('Stock máximo alcanzado', 'warning'); return i; }
        return { ...i, quantity: newQty };
      }).filter(Boolean);
    });
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  async function registerSale() {
    if (!cart.length) { showToast?.('El carrito está vacío', 'warning'); return; }
    setRegistering(true);
    try {
      const sale = await API.sales.create({
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity, unitPrice: i.product.price })),
        notes,
      });
      showToast?.(`Venta #${sale.id} registrada — ${fmt(sale.total)}`);
      setCart([]);
      setNotes('');
      loadProducts();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    } finally {
      setRegistering(false);
    }
  }

  async function showHistorial() {
    setView('historial');
    setHistLoading(true);
    try {
      const data = await API.sales.list() || [];
      setSalesHistory(data);
    } catch (e) {
      showToast?.('Error cargando historial: ' + e.message, 'error');
    } finally {
      setHistLoading(false);
    }
  }

  return (
    <>
      {view === 'nueva' ? (
        <div className="sale-grid">
          {/* Selector de productos */}
          <div>
            <div className="table-container">
              <div className="table-header">
                <h2>Seleccionar Productos</h2>
                <input type="text" placeholder="Buscar producto..." style={{ width: 200 }}
                  value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              </div>
              {products.length === 0 ? (
                <div className="loading-state">Sin productos disponibles</div>
              ) : (
                <table>
                  <thead><tr><th>Producto</th><th>SKU</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="mono">{p.sku}</td>
                        <td className="mono">{fmt(p.price)}</td>
                        <td>{p.stockCurrent} {p.unit}</td>
                        <td><button className="btn btn-primary btn-sm" onClick={() => addToCart(p)}>+ Agregar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Carrito */}
          <div className="cart-panel">
            <div className="cart-header"><h3>Carrito de venta</h3></div>
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="empty-cart">Agregue productos desde el catálogo</div>
              ) : (
                cart.map(i => (
                  <div key={i.product.id} className="cart-item">
                    <div>
                      <div className="cart-item-name">{i.product.name}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmt(i.product.price)} c/u</div>
                    </div>
                    <div className="cart-item-qty">
                      <button className="qty-btn" onClick={() => changeQty(i.product.id, -1)}>−</button>
                      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 20, textAlign: 'center' }}>{i.quantity}</span>
                      <button className="qty-btn" onClick={() => changeQty(i.product.id, 1)}>+</button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', minWidth: 80, textAlign: 'right' }}>{fmt(i.product.price * i.quantity)}</div>
                    <button onClick={() => setCart(prev => prev.filter(x => x.product.id !== i.product.id))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>✕</button>
                  </div>
                ))
              )}
            </div>
            <div className="cart-footer">
              <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', fontFamily: 'var(--font-mono)' }}>TOTAL</div>
              <div className="cart-total">{fmt(cartTotal)}</div>
              <div className="form-group">
                <label>Notas (opcional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Venta mostrador" />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={registerSale} disabled={registering}>
                {registering ? 'Registrando...' : 'Registrar venta'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header"><h2>Historial de Ventas</h2></div>
          {histLoading ? (
            <div className="loading-state"><div className="spinner" /> Cargando...</div>
          ) : salesHistory.length === 0 ? (
            <div className="loading-state">Sin ventas registradas</div>
          ) : (
            <table>
              <thead><tr><th>#</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {salesHistory.map(s => (
                  <tr key={s.id}>
                    <td className="mono">#{s.id}</td>
                    <td>{s.user?.username || '—'}</td>
                    <td>{s.details?.length || 0} ítem(s)</td>
                    <td className="mono"><strong>{fmt(s.total)}</strong></td>
                    <td><span className={`badge ${s.status === 'COMPLETED' ? 'badge-success' : 'badge-muted'}`}>{s.status}</span></td>
                    <td className="mono">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
