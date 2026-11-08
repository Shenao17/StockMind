import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API } from '../../api';

/** Cantidad de productos con stock crítico (para el aviso del menú). Se refresca al cambiar de pantalla. */
export default function useLowStock() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    API.products.lowStock()
      .then((r) => { if (!cancelled) setCount(Array.isArray(r) ? r.length : (r?.length ?? 0)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);
  return count;
}
