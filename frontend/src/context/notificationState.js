import { createContext, useContext } from 'react';

/** Contexto del motor de notificaciones (el valor sale de useToast() en App.jsx). */
const noop = () => {};

export const NotificationContext = createContext({
  toasts: [],
  history: [],
  unreadCount: 0,
  pendingCritical: 0,
  showToast: noop,
  notify: {},
  dismiss: noop,
  resolve: noop,
  pause: noop,
  resume: noop,
  markAllRead: noop,
  clearHistory: noop,
});

export const useNotifications = () => useContext(NotificationContext);

/** Evento para abrir el centro de notificaciones desde cualquier parte (p. ej. "+2 más"). */
export const OPEN_CENTER_EVENT = 'stockmind:open-notifications';
