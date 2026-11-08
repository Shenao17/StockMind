/**
 * Skeleton — Marcadores de carga con la forma real de cada pantalla (destello suave azul → cian).
 * Aparecen con un pequeño retraso (CSS): si los datos llegan rápido, no se ve parpadeo.
 * Accesibilidad: la región queda `aria-busy` y lleva un texto oculto "Cargando".
 */
export function Skeleton({ width = '100%', height = 12, radius, style, className = '' }) {
  return <span className={`sk ${className}`} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonRegion({ label = 'Cargando', className = '', children }) {
  return (
    <div className={`sk-region ${className}`} aria-busy="true" role="status">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Tarjetas de cifras (como las del Dashboard). */
export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }, (_, i) => (
        <div className="stat-card" key={i}>
          <Skeleton width="45%" height={9} />
          <Skeleton width="70%" height={22} style={{ marginTop: 14 }} />
          <Skeleton width="55%" height={9} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

/** Tabla: encabezado y filas. En celular cada fila se apila como tarjeta. */
export function SkeletonTable({ rows = 6, cols = 5, title = true }) {
  const grid = { gridTemplateColumns: `2fr repeat(${Math.max(cols - 1, 1)}, 1fr)` };
  return (
    <div className="table-container sk-table">
      {title && (
        <div className="table-header">
          <Skeleton width={180} height={16} />
          <Skeleton width={120} height={32} radius={10} />
        </div>
      )}
      {Array.from({ length: rows }, (_, r) => (
        <div className="sk-row" style={grid} key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={c === 0 ? 13 : 11} width={c === 0 ? `${78 - (r % 3) * 10}%` : `${60 - (c % 2) * 15}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tarjetas de planes o productos. */
export function SkeletonCards({ count = 3 }) {
  return (
    <div className="plans-grid">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-card" key={i}>
          <Skeleton width="50%" height={16} />
          <Skeleton width="70%" height={28} style={{ marginTop: 6 }} />
          <Skeleton height={10} />
          <Skeleton width="85%" height={10} />
          <Skeleton width="60%" height={10} />
          <Skeleton height={36} radius={10} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}
