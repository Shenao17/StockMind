/**
 * BrandLogo — Logo de StockMind (SVG, nítido a cualquier tamaño).
 *
 *  - variant "full": ícono + nombre. "icon": solo el cubo.
 *  - tone "color": para fondos oscuros (nombre en blanco). "white": una tinta blanca (sobre color o foto).
 *    "navy": una tinta azul marino (fondos claros).
 *
 * Si el logo es lo único que dice "StockMind" en esa zona, deja el texto alternativo (alt); si va junto a
 * el nombre escrito, pasa alt="" para que los lectores de pantalla no lo repitan.
 */
const FILES = {
  full: { color: 'logo-color', white: 'logo-blanco', navy: 'logo-azul-marino' },
  icon: { color: 'icono-color', white: 'icono-blanco', navy: 'icono-azul-marino' },
};
// Proporción real de cada archivo (ancho / alto) para reservar el espacio y evitar saltos al cargar
const RATIO = { full: 972 / 256, icon: 239 / 243 };

export default function BrandLogo({ variant = 'full', tone = 'color', height = 32, alt = 'StockMind', className = '', ...rest }) {
  const file = (FILES[variant] || FILES.full)[tone] || FILES.full.color;
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={`/brand/${file}.svg`}
      alt={alt}
      height={height}
      width={Math.round(height * (RATIO[variant] || RATIO.full))}
      draggable={false}
      {...rest}
    />
  );
}
