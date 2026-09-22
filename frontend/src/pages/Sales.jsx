import { useEffect, useState } from 'react';
import { API, fmt, fmtDate } from '../api';

export default function Sales({ showToast }) {
  const [view, setView] = useState('nueva');
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [salesHistory, setSalesHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const q = productSearch.toLowerCase();

    setProducts(
      allProducts.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      )
    );
  }, [productSearch, allProducts]);

  async function loadProducts() {
    try {
      const data = (await API.products.list() || []).filter(
        p => p.stockCurrent > 0
      );

      setAllProducts(data);
      setProducts(data);
    } catch (e) {
      showToast?.(
        'Error cargando productos: ' + e.message,
        'error'
      );
    }
  }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(
        i => i.product.id === product.id
      );

      if (existing) {
        if (existing.quantity >= product.stockCurrent) {
          showToast?.(
            'Stock máximo alcanzado',
            'warning'
          );

          return prev;
        }

        return prev.map(i =>
          i.product.id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1
              }
            : i
        );
      }

      return [
        ...prev,
        {
          product,
          quantity: 1
        }
      ];
    });
  }

  function changeQty(productId, delta) {
    setCart(prev => {
      return prev
        .map(i => {
          if (i.product.id !== productId) {
            return i;
          }

          const newQty = i.quantity + delta;

          if (newQty <= 0) {
            return null;
          }

          if (newQty > i.product.stockCurrent) {
            showToast?.(
              'Stock máximo alcanzado',
              'warning'
            );

            return i;
          }

          return {
            ...i,
            quantity: newQty
          };
        })
        .filter(Boolean);
    });
  }

  const cartTotal = cart.reduce(
    (sum, i) =>
      sum + i.product.price * i.quantity,
    0
  );

  const cartItemsCount = cart.reduce(
    (sum, i) => sum + i.quantity,
    0
  );

  async function registerSale() {
    if (!cart.length) {
      showToast?.(
        'El carrito está vacío',
        'warning'
      );

      return;
    }

    setRegistering(true);

    try {
      const sale = await API.sales.create({
        items: cart.map(i => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.product.price
        })),
        notes
      });

      showToast?.(
        `Venta #${sale.id} registrada — ${fmt(sale.total)}`
      );

      setCart([]);
      setNotes('');
      loadProducts();
    } catch (e) {
      showToast?.(
        'Error: ' + e.message,
        'error'
      );
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
      showToast?.(
        'Error cargando historial: ' + e.message,
        'error'
      );
    } finally {
      setHistLoading(false);
    }
  }

  return (
    <div className="sales-module">

      {/* =====================================================
          SALES HEADER
          ===================================================== */}

      <div className="sales-heading">

        <div className="sales-heading-copy">
          <span className="sales-eyebrow">
            SALES / POS
          </span>

          <h1>
            {view === 'nueva'
              ? 'Nueva venta'
              : 'Historial de ventas'}
          </h1>

          <p>
            {view === 'nueva'
              ? 'Selecciona productos y prepara la venta.'
              : 'Consulta las ventas registradas en StockMind.'}
          </p>
        </div>

        <div className="sales-view-switch">

          <button
            className={view === 'nueva' ? 'active' : ''}
            onClick={() => setView('nueva')}
          >
            <span>＋</span>
            Nueva venta
          </button>

          <button
            className={view === 'historial' ? 'active' : ''}
            onClick={showHistorial}
          >
            <span>◷</span>
            Historial
          </button>

        </div>

      </div>


      {/* =====================================================
          NUEVA VENTA
          ===================================================== */}

      {view === 'nueva' ? (

        <div className="sale-grid">

          {/* =================================================
              PRODUCT CATALOG
              ================================================= */}

          <section className="sales-catalog">

            <div className="catalog-shell">

              <div className="catalog-top">

                <div className="catalog-title">
                  <div className="catalog-title-icon">
                    ◈
                  </div>

                  <div>
                    <h2>Catálogo</h2>

                    <span>
                      {products.length} productos disponibles
                    </span>
                  </div>
                </div>

                <div className="catalog-search">

                  <span className="search-icon">
                    ⌕
                  </span>

                  <input
                    type="text"
                    placeholder="Buscar producto o SKU..."
                    value={productSearch}
                    onChange={e =>
                      setProductSearch(e.target.value)
                    }
                  />

                  {productSearch && (
                    <button
                      className="search-clear"
                      onClick={() => setProductSearch('')}
                      aria-label="Limpiar búsqueda"
                    >
                      ×
                    </button>
                  )}

                </div>

              </div>


              {/* =============================================
                  PRODUCT GRID
                  ============================================= */}

              {products.length === 0 ? (

                <div className="sales-empty">

                  <div className="sales-empty-icon">
                    ◌
                  </div>

                  <strong>
                    Sin productos disponibles
                  </strong>

                  <span>
                    Intenta realizar otra búsqueda.
                  </span>

                </div>

              ) : (

                <div className="product-grid">

                  {products.map(p => {

                    const cartItem = cart.find(
                      i => i.product.id === p.id
                    );

                    const stockPercentage =
                      Math.min(
                        (p.stockCurrent / 20) * 100,
                        100
                      );

                    let stockClass = 'high';

                    if (p.stockCurrent <= 5) {
                      stockClass = 'low';
                    } else if (p.stockCurrent <= 10) {
                      stockClass = 'medium';
                    }

                    return (

                      <article
                        key={p.id}
                        className={`product-card ${
                          cartItem
                            ? 'in-cart'
                            : ''
                        }`}
                      >

                        <div className="product-card-glow" />

                        <div className="product-card-top">

                          <span className="product-index">
                            #{String(p.id).padStart(3, '0')}
                          </span>

                          {cartItem && (
                            <span className="product-added">
                              ✓ {cartItem.quantity}
                            </span>
                          )}

                        </div>

                        <div className="product-symbol">
                          ◈
                        </div>

                        <div className="product-info">

                          <h3>
                            {p.name}
                          </h3>

                          <span className="product-sku">
                            {p.sku}
                          </span>

                        </div>

                        <div className="product-price">
                          {fmt(p.price)}
                        </div>

                        <div className="product-stock">

                          <div className="stock-meta">
                            <span>STOCK</span>

                            <strong>
                              {p.stockCurrent} {p.unit}
                            </strong>
                          </div>

                          <div className="stock-track">
                            <div
                              className={`stock-fill ${stockClass}`}
                              style={{
                                width: `${stockPercentage}%`
                              }}
                            />
                          </div>

                        </div>

                        <button
                          className="product-add"
                          onClick={() =>
                            addToCart(p)
                          }
                        >
                          <span>
                            {cartItem
                              ? 'Agregar otro'
                              : 'Agregar'}
                          </span>

                          <strong>+</strong>
                        </button>

                      </article>

                    );
                  })}

                </div>

              )}

            </div>

          </section>


          {/* =================================================
              CART
              ================================================= */}

          <aside className="cart-panel">

            <div className="cart-orb cart-orb-one" />
            <div className="cart-orb cart-orb-two" />

            <div className="cart-header">

              <div>

                <span className="cart-eyebrow">
                  CURRENT ORDER
                </span>

                <h3>
                  Venta actual
                </h3>

              </div>

              <div className="cart-count">
                {cartItemsCount}
              </div>

            </div>


            <div className="cart-items">

              {cart.length === 0 ? (

                <div className="empty-cart">

                  <div className="empty-cart-icon">
                    🛒
                  </div>

                  <strong>
                    Tu carrito está vacío
                  </strong>

                  <span>
                    Agrega productos del catálogo
                    para comenzar la venta.
                  </span>

                </div>

              ) : (

                cart.map(i => (

                  <div
                    key={i.product.id}
                    className="cart-item"
                  >

                    <div className="cart-item-main">

                      <div className="cart-item-symbol">
                        ◈
                      </div>

                      <div className="cart-item-info">

                        <div className="cart-item-name">
                          {i.product.name}
                        </div>

                        <div className="cart-item-price">
                          {fmt(i.product.price)} c/u
                        </div>

                      </div>

                    </div>

                    <div className="cart-item-bottom">

                      <div className="cart-item-qty">

                        <button
                          className="qty-btn"
                          onClick={() =>
                            changeQty(
                              i.product.id,
                              -1
                            )
                          }
                        >
                          −
                        </button>

                        <span>
                          {i.quantity}
                        </span>

                        <button
                          className="qty-btn"
                          onClick={() =>
                            changeQty(
                              i.product.id,
                              1
                            )
                          }
                        >
                          +
                        </button>

                      </div>

                      <strong className="cart-item-total">
                        {fmt(
                          i.product.price *
                          i.quantity
                        )}
                      </strong>

                      <button
                        className="cart-remove"
                        onClick={() =>
                          setCart(prev =>
                            prev.filter(
                              x =>
                                x.product.id !==
                                i.product.id
                            )
                          )
                        }
                        aria-label="Eliminar producto"
                      >
                        ×
                      </button>

                    </div>

                  </div>

                ))

              )}

            </div>


            <div className="cart-footer">

              <div className="cart-total-label">
                TOTAL DE LA VENTA
              </div>

              <div className="cart-total">
                {fmt(cartTotal)}
              </div>

              <div className="cart-note">

                <label>
                  Nota <span>opcional</span>
                </label>

                <input
                  type="text"
                  value={notes}
                  onChange={e =>
                    setNotes(e.target.value)
                  }
                  placeholder="Ej: Venta mostrador"
                />

              </div>

              <button
                className="register-sale"
                onClick={registerSale}
                disabled={registering}
              >

                <span>
                  {registering
                    ? 'Registrando...'
                    : 'Registrar venta'}
                </span>

                {!registering && (
                  <strong>→</strong>
                )}

              </button>

            </div>

          </aside>

        </div>

      ) : (

        /* ===================================================
           HISTORIAL
           =================================================== */

        <div className="sales-history">

          <div className="table-container">

            <div className="table-header">

              <div>
                <span className="history-eyebrow">
                  SALES LOG
                </span>

                <h2>
                  Historial de Ventas
                </h2>
              </div>

              <span className="history-count">
                {salesHistory.length} registros
              </span>

            </div>

            {histLoading ? (

              <div className="loading-state">
                <div className="spinner" />
                Cargando...
              </div>

            ) : salesHistory.length === 0 ? (

              <div className="loading-state">
                Sin ventas registradas
              </div>

            ) : (

              <table>

                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vendedor</th>
                    <th>Productos</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>

                <tbody>

                  {salesHistory.map(s => (

                    <tr key={s.id}>

                      <td className="mono">
                        #{s.id}
                      </td>

                      <td>
                        {s.user?.username || '—'}
                      </td>

                      <td>
                        {s.details?.length || 0}
                        {' '}
                        ítem(s)
                      </td>

                      <td className="mono">
                        <strong>
                          {fmt(s.total)}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            s.status === 'COMPLETED'
                              ? 'badge-success'
                              : 'badge-muted'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      <td className="mono">
                        {fmtDate(s.createdAt)}
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            )}

          </div>

        </div>

      )}

    </div>
  );
}