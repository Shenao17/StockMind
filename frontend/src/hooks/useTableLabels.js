import { useEffect } from 'react';

/**
 * Pone en cada celda el nombre de su columna (data-label) para que, en pantallas pequeñas, las tablas
 * se muestren como tarjetas ("Columna: valor") en vez de obligar a deslizar de lado. Se usa una sola vez
 * en la raíz de la app: cubre cualquier tabla dentro de .table-container, también las que se crean después.
 * El CSS (index.css, ≤ 640 px) es lo que decide cuándo se ven como tarjetas.
 */
export function labelTables(root = document) {
  root.querySelectorAll('.table-container table').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (heads.length === 0) return;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((cell, i) => {
        const label = heads[i] ?? '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      });
    });
  });
}

export function useTableLabels() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTables());
    };
    schedule();
    // Solo cambios en la estructura (filas nuevas); poner data-label no dispara de nuevo el observador
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
}
