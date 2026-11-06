/**
 * Pagination — Controles de paginación del lado del servidor.
 * `page` es base 0 (como la API); se muestra base 1 al usuario.
 * No se dibuja si hay una sola página.
 */
export default function Pagination({ page, totalPages, totalElements, onPage }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Paginación">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 0}
      >
        ← Anterior
      </button>

      <span className="pagination-info">
        Página {page + 1} de {totalPages}
        {typeof totalElements === 'number' && ` · ${totalElements} registros`}
      </span>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
      >
        Siguiente →
      </button>
    </nav>
  );
}
