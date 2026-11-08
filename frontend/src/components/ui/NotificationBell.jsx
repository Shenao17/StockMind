import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotifications, OPEN_CENTER_EVENT } from '../../context/notificationState';
import NotificationIcon from './NotificationIcon';

/** "ahora", "hace 5 min", "hace 2 h" o la fecha. */
function timeAgo(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/**
 * Centro de notificaciones (campana de la barra superior).
 * Guarda lo que pasó en la sesión y mantiene las críticas hasta que se resuelven.
 */
export default function NotificationBell() {
  const { history, unreadCount, pendingCritical, markAllRead, clearHistory, resolve } = useNotifications();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState(null);   // posición del panel junto a la campana
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const panelId = useId();

  // El panel se dibuja en <body> (portal), por encima de todo y fuera de la barra superior.
  const measure = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAnchor({ top: Math.round(r.bottom + 10), right: Math.round(window.innerWidth - r.right) });
  };

  const show = () => { measure(); setNow(Date.now()); setOpen(true); };
  const hide = (returnFocus = true) => {
    setOpen(false);
    markAllRead();
    if (returnFocus) buttonRef.current?.focus();
  };

  // Abrir desde otras partes ("+2 más · Ver todas")
  useEffect(() => {
    const onOpen = () => { measure(); setNow(Date.now()); setOpen(true); };
    window.addEventListener(OPEN_CENTER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CENTER_EVENT, onOpen);
  }, []);

  // Cerrar con Escape o clic fuera; refrescar los "hace N min" mientras está abierto
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); markAllRead(); buttonRef.current?.focus(); } };
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
      markAllRead();
    };
    const onResize = () => measure();
    const tick = setInterval(() => setNow(Date.now()), 30000);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(tick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open, markAllRead]);

  const runAction = (item) => {
    try {
      item.action?.onClick?.();
    } finally {
      if (item.action?.href) navigate(item.action.href);
      if (item.type === 'critical') resolve(item.id);
      hide(false);
    }
  };

  const badge = unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null;
  const label = [
    'Notificaciones',
    unreadCount ? `${unreadCount} sin leer` : null,
    pendingCritical ? `${pendingCritical} requieren acción` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="ntf-center" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`ntf-bell${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? hide() : show())}
      >
        <NotificationIcon name="bell" size={19} />
        {badge && <span className={`ntf-badge${pendingCritical ? ' is-critical' : ''}`}>{badge}</span>}
        {!badge && pendingCritical > 0 && <span className="ntf-dot" aria-hidden="true" />}
      </button>

      {open && createPortal(
        <div className="ntf-panel" id={panelId} ref={panelRef} role="dialog" aria-label="Centro de notificaciones"
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}>
          <div className="ntf-panel-surface">
            <div className="ntf-panel-inner">
              <div className="ntf-panel-head">
                <span className="ntf-panel-title">Notificaciones</span>
                {history.length > 0 && (
                  <button type="button" className="ntf-link" onClick={clearHistory}>Limpiar</button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="ntf-empty">
                  <NotificationIcon name="success" size={22} />
                  <p>Todo en orden. Aquí verás lo que pase durante tu sesión.</p>
                </div>
              ) : (
                <ul className="ntf-list">
                  {history.map((item) => {
                    const pending = item.type === 'critical' && !item.resolved;
                    return (
                      <li key={item.id} className={`ntf-entry ntf-${item.type}${item.read ? '' : ' is-unread'}${pending ? ' is-pending' : ''}`}>
                        <span className="ntf-icon"><NotificationIcon name={item.type} size={16} /></span>
                        <div className="ntf-body">
                          <p className="ntf-title">
                            {item.title || item.message}
                            {item.count > 1 && <span className="ntf-count">×{item.count}</span>}
                          </p>
                          {item.title && item.message && <p className="ntf-message">{item.message}</p>}
                          <span className="ntf-time">{pending ? 'Requiere acción · ' : ''}{timeAgo(item.createdAt, now)}</span>
                          {pending && (
                            <div className="ntf-entry-actions">
                              {item.action && (
                                <button type="button" className="ntf-primary ntf-primary-sm" onClick={() => runAction(item)}>
                                  {item.action.label}
                                </button>
                              )}
                              <button type="button" className="ntf-link" onClick={() => resolve(item.id)}>
                                Marcar como resuelta
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
