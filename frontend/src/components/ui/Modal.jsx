import { useEffect } from 'react';

/**
 * Modal — Cuadro de diálogo. size="wide" para formularios largos con columnas.
 * En celular se muestra como hoja que sube desde abajo (ver index.css). Mientras está abierto la página de
 * atrás no se desplaza y se oculta la burbuja del asistente (si no, tapaba los botones).
 */
export default function Modal({ open, onClose, title, children, footer, size }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${size === 'wide' ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="modal-title">{title}</h3>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
