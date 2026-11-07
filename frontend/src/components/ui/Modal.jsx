/** Modal — Cuadro de diálogo. size="wide" para formularios largos con columnas. */
export default function Modal({ open, onClose, title, children, footer, size }) {
  if (!open) return null;
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${size === 'wide' ? ' modal-wide' : ''}`}>
        <h3 className="modal-title">{title}</h3>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
