import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con retraso: solo se actualiza cuando deja de cambiar
 * durante `delay` ms. Evita una petición al servidor por cada tecla.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
