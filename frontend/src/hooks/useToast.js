import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Motor de notificaciones de StockMind.
 *
 * Dos familias:
 *  - Informativas (success, info, warning, error): se cierran solas, se pausan al pasar el mouse
 *    o al enfocarlas, y se agrupan si se repiten ("×3").
 *  - Críticas (critical): NO se cierran solas, van siempre primero y suelen traer una acción.
 *    Al ocultarlas quedan en el centro de notificaciones (la campana) hasta resolverse.
 *
 * Compatible con la API anterior: showToast(mensaje, tipo, duración).
 * También acepta un objeto: showToast({ type, title, message, action, duration }).
 * Cualquier módulo (p. ej. api.js) puede notificar sin props con emitNotification({...}).
 */

export const NOTIFY_EVENT = 'stockmind:notify';

export const DEFAULT_DURATIONS = {
  success: 4500,
  info: 4500,
  warning: 6000,
  error: 7000,
  critical: null,   // persistente
};

const TYPES = Object.keys(DEFAULT_DURATIONS);
export const MAX_VISIBLE = 3;
export const HISTORY_LIMIT = 30;
export const EXIT_MS = 200;
const MIN_RESUME_MS = 1200;

let toastId = 0;

/** Normaliza (mensaje, tipo, duración) u objeto a una notificación. */
function normalize(input, type, duration) {
  const base = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? input
    : { message: input, type, duration };

  const t = TYPES.includes(base.type) ? base.type : 'success';
  const message = base.message == null ? '' : String(base.message);
  const d = base.duration === undefined ? DEFAULT_DURATIONS[t] : base.duration;
  return {
    type: t,
    title: base.title ? String(base.title) : null,
    message,
    action: base.action || null,            // { label, onClick?, href? }
    duration: t === 'critical' ? null : (Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATIONS[t]),
    key: base.key || `${t}|${base.title || ''}|${message}`,
  };
}

export const isCritical = (n) => n.type === 'critical';

/** Críticas primero (la más antigua arriba); luego las informativas, la más reciente arriba. */
export function orderToasts(toasts) {
  const critical = toasts.filter(isCritical);
  const rest = toasts.filter((t) => !isCritical(t)).reverse();
  return [...critical, ...rest];
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState([]);

  // Las refs son la fuente de verdad: varias llamadas seguidas (en el mismo tick) ven el estado real
  const toastsRef = useRef([]);
  const historyRef = useRef([]);
  const timers = useRef(new Map());   // id → { handle, remaining, startedAt }
  const exits = useRef(new Set());

  const commitToasts = useCallback((next) => { toastsRef.current = next; setToasts(next); }, []);
  const commitHistory = useCallback((next) => { historyRef.current = next; setHistory(next); }, []);

  const clearTimer = useCallback((id) => {
    const t = timers.current.get(id);
    if (t?.handle) clearTimeout(t.handle);
    timers.current.delete(id);
  }, []);

  const remove = useCallback((id) => {
    clearTimer(id);
    commitToasts(toastsRef.current.filter((t) => t.id !== id));
  }, [clearTimer, commitToasts]);

  /** Cierra con animación de salida. */
  const dismiss = useCallback((id) => {
    clearTimer(id);
    if (!toastsRef.current.some((t) => t.id === id && !t.leaving)) return;
    commitToasts(toastsRef.current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const handle = setTimeout(() => { exits.current.delete(handle); remove(id); }, EXIT_MS);
    exits.current.add(handle);
  }, [clearTimer, commitToasts, remove]);

  const startTimer = useCallback((id, ms) => {
    clearTimer(id);
    if (!ms) return;
    const handle = setTimeout(() => dismiss(id), ms);
    timers.current.set(id, { handle, remaining: ms, startedAt: Date.now() });
  }, [clearTimer, dismiss]);

  const setFlag = useCallback((id, patch) => {
    commitToasts(toastsRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, [commitToasts]);

  const pause = useCallback((id) => {
    const t = timers.current.get(id);
    if (!t?.handle) return;
    clearTimeout(t.handle);
    timers.current.set(id, { handle: null, remaining: Math.max(0, t.remaining - (Date.now() - t.startedAt)) });
    setFlag(id, { paused: true });
  }, [setFlag]);

  const resume = useCallback((id) => {
    const t = timers.current.get(id);
    if (!t || t.handle) return;
    startTimer(id, Math.max(t.remaining, MIN_RESUME_MS));
    setFlag(id, { paused: false });
  }, [startTimer, setFlag]);

  const showToast = useCallback((input, type = 'success', duration) => {
    const n = normalize(input, type, duration);
    if (!n.message && !n.title) return null;

    const list = toastsRef.current;

    // Un error con el mismo texto que una crítica visible es redundante
    if (n.type === 'error' && list.some((t) => isCritical(t) && !t.leaving && t.message === n.message)) {
      return null;
    }

    const now = Date.now();
    const same = list.find((t) => t.key === n.key && !t.leaving);
    let id;

    if (same) {
      // Repetida y aún visible: se agrupa y reinicia su tiempo
      id = same.id;
      commitToasts(list.map((t) => (t.id === id ? { ...t, count: t.count + 1, createdAt: now, paused: false } : t)));
      if (same.duration) startTimer(id, same.duration);
    } else {
      id = ++toastId;
      commitToasts([...list, { ...n, id, count: 1, createdAt: now, paused: false, leaving: false }]);
      if (n.duration) startTimer(id, n.duration);
    }

    const hist = historyRef.current;
    const existing = hist.find((h) => h.id === id);
    if (existing) {
      commitHistory([{ ...existing, count: existing.count + 1, read: false, createdAt: now },
        ...hist.filter((h) => h.id !== id)]);
    } else {
      const entry = { id, type: n.type, title: n.title, message: n.message, action: n.action,
        count: 1, read: false, resolved: false, createdAt: now };
      commitHistory([entry, ...hist].slice(0, HISTORY_LIMIT));
    }
    return id;
  }, [commitToasts, commitHistory, startTimer]);

  /** Atajos: notify.success('…'), notify.critical({ title, message, action }) */
  const notify = useMemo(() => {
    const make = (t) => (input, duration) =>
      showToast(typeof input === 'object' && input !== null
        ? { ...input, type: t }
        : { message: input, type: t, duration });
    return Object.fromEntries(TYPES.map((t) => [t, make(t)]));
  }, [showToast]);

  /** Marca una notificación como resuelta: sale de la pila y deja de contar como pendiente. */
  const resolve = useCallback((id) => {
    dismiss(id);
    commitHistory(historyRef.current.map((h) => (h.id === id ? { ...h, resolved: true, read: true } : h)));
  }, [dismiss, commitHistory]);

  const markAllRead = useCallback(() => {
    commitHistory(historyRef.current.map((h) => (h.read ? h : { ...h, read: true })));
  }, [commitHistory]);

  /** Vacía el historial. Las críticas sin resolver se conservan: siguen requiriendo acción. */
  const clearHistory = useCallback(() => {
    commitHistory(historyRef.current.filter((h) => h.type === 'critical' && !h.resolved));
  }, [commitHistory]);

  // Notificaciones desde fuera de React (api.js, servicios)
  useEffect(() => {
    const onNotify = (e) => { if (e.detail) showToast(e.detail); };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify);
  }, [showToast]);

  // Limpieza de temporizadores al desmontar
  useEffect(() => {
    const map = timers.current;
    const pending = exits.current;
    return () => {
      for (const t of map.values()) if (t.handle) clearTimeout(t.handle);
      for (const h of pending) clearTimeout(h);
      map.clear();
      pending.clear();
    };
  }, []);

  const unreadCount = history.filter((h) => !h.read).length;
  const pendingCritical = history.filter((h) => h.type === 'critical' && !h.resolved).length;

  return {
    toasts, showToast, notify, dismiss, resolve, pause, resume,
    history, unreadCount, pendingCritical, markAllRead, clearHistory,
  };
}

/** Lanza una notificación desde cualquier módulo (sin hooks ni props). */
export function emitNotification(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail }));
}
