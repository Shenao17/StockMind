import { render, screen } from '@testing-library/react';
import BrandLogo from '../components/ui/BrandLogo';

describe('BrandLogo', () => {
  it('por defecto es el logo completo a color, con texto alternativo y proporción reservada', () => {
    render(<BrandLogo height={40} />);
    const img = screen.getByAltText('StockMind');
    expect(img).toHaveAttribute('src', '/brand/logo-color.svg');
    expect(img).toHaveAttribute('height', '40');
    expect(img).toHaveAttribute('width', String(Math.round(40 * (972 / 256))));   // evita saltos de diseño al cargar
  });

  it('elige el archivo según la variante y la tinta', () => {
    const { rerender } = render(<BrandLogo variant="icon" tone="white" alt="" />);
    expect(document.querySelector('img')).toHaveAttribute('src', '/brand/icono-blanco.svg');
    rerender(<BrandLogo variant="full" tone="navy" alt="" />);
    expect(document.querySelector('img')).toHaveAttribute('src', '/brand/logo-azul-marino.svg');
    rerender(<BrandLogo variant="icon" tone="color" alt="" />);
    expect(document.querySelector('img')).toHaveAttribute('src', '/brand/icono-color.svg');
  });

  it('una variante o tinta desconocida cae en el logo a color (nunca una imagen rota)', () => {
    render(<BrandLogo variant="otra" tone="rosa" alt="x" />);
    expect(screen.getByAltText('x')).toHaveAttribute('src', '/brand/logo-color.svg');
  });

  it('con alt vacío es decorativa (no se repite para lectores de pantalla)', () => {
    render(<BrandLogo alt="" />);
    expect(screen.getByRole('presentation')).toBeInTheDocument();
  });
});
