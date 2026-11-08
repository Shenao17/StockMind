import { NavLink } from 'react-router-dom';
import NavIcon from '../ui/NavIcon';
import useLowStock from './useLowStock';

/** BottomNav — Barra inferior del celular: 4 accesos diarios, venta rápida al centro y "Más" (abre el menú completo). */
export default function BottomNav({ onMore }) {
  const low = useLowStock();
  const cls = ({ isActive }) => `bn-item${isActive ? ' active' : ''}`;
  return (
    <nav className="bottom-nav" aria-label="Accesos rápidos">
      <NavLink to="/dashboard" className={cls}><NavIcon type="dashboard" className="bn-icon" /><span>Inicio</span></NavLink>
      <NavLink to="/products" className={cls}><NavIcon type="products" className="bn-icon" /><span>Productos</span></NavLink>
      <NavLink to="/sales" className="bn-fab" aria-label="Nueva venta"><NavIcon type="cart" className="bn-icon" /></NavLink>
      <NavLink to="/inventory" className={cls}>
        <NavIcon type="inventory" className="bn-icon" /><span>Inventario</span>
        {low > 0 && <i className="bn-dot" aria-label={`${low} con stock crítico`}>{low}</i>}
      </NavLink>
      <button type="button" className="bn-item" onClick={onMore} aria-label="Más opciones" aria-controls="app-sidebar">
        <NavIcon type="more" className="bn-icon" /><span>Más</span>
      </button>
    </nav>
  );
}
