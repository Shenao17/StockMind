import { useNavigate } from 'react-router-dom';
import { useNotifications, OPEN_CENTER_EVENT } from '../../context/notificationState';
import { MAX_VISIBLE, isCritical, orderToasts } from '../../hooks/useToast';
import NotificationIcon from './NotificationIcon';

/**
 * Pila de notificaciones: arriba a la derecha, debajo de la barra superior
 * (en celular, arriba a todo lo ancho). Ya no comparte esquina con el asistente.
 *
 * Superficie "esmerilada" SIN backdrop-filter: color casi opaco, degradado y brillo de borde
 * pintados una sola vez. Casi no consume GPU (el vidrio de StockMindGlass queda solo en el
 * asistente). Solo se animan transform y opacity, que resuelve el compositor.
 */

function Toast({ toast, onAction, dismiss, pause, resume }) {
  const critical = isCritical(toast);
  const assertive = critical || toast.type === 'error';
  const heading = toast.title || toast.message;
  const detail = toast.title ? toast.message : null;

  const onBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) resume(toast.id);
  };

  return (
    <div
      className={`ntf-item ntf-${toast.type}${toast.leaving ? ' is-leaving' : ''}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => pause(toast.id)}
      onMouseLeave={() => resume(toast.id)}
      onFocus={() => pause(toast.id)}
      onBlur={onBlur}
    >
      <div className="ntf-surface">
        <div className="ntf-inner">
          <div className="ntf-row">
            <span className="ntf-icon"><NotificationIcon name={toast.type} /></span>
            <div className="ntf-body">
              {critical && <span className="ntf-eyebrow">Requiere acción</span>}
              <p className="ntf-title">{heading}</p>
              {detail && <p className="ntf-message">{detail}</p>}
            </div>
            {toast.count > 1 && <span className="ntf-count" aria-label={`${toast.count} veces`}>×{toast.count}</span>}
            {toast.action && !critical && (
              <button type="button" className="ntf-link" onClick={() => onAction(toast)}>
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="ntf-close"
              onClick={() => dismiss(toast.id)}
              aria-label={critical ? 'Ocultar; queda en el centro de notificaciones' : 'Cerrar notificación'}
            >
              <NotificationIcon name="close" size={16} />
            </button>
          </div>

          {critical && toast.action && (
            <div className="ntf-actions">
              <button type="button" className="ntf-primary" onClick={() => onAction(toast)}>
                {toast.action.label}
              </button>
            </div>
          )}

          {toast.duration && (
            <div className="ntf-progress" aria-hidden="true">
              <span
                key={`${toast.createdAt}`}
                className={toast.paused ? 'is-paused' : ''}
                style={{ animationDuration: `${toast.duration}ms` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss, resolve, pause, resume } = useNotifications();
  const navigate = useNavigate();

  if (!toasts.length) return null;

  const ordered = orderToasts(toasts);
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  const onAction = (toast) => {
    const { action } = toast;
    try {
      action?.onClick?.();
    } finally {
      if (action?.href) navigate(action.href);
      if (isCritical(toast)) resolve(toast.id); else dismiss(toast.id);
    }
  };

  return (
    <section className="ntf-stack" aria-label="Notificaciones">
      {visible.map((t) => (
        <Toast key={t.id} toast={t} onAction={onAction} dismiss={dismiss} pause={pause} resume={resume} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="ntf-more"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CENTER_EVENT))}
        >
          +{hidden} más · Ver todas
        </button>
      )}
    </section>
  );
}

export default ToastContainer;
