import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  useToast, emitNotification, orderToasts, DEFAULT_DURATIONS, EXIT_MS, MAX_VISIBLE, HISTORY_LIMIT,
} from '../hooks/useToast';
import { NotificationContext } from '../context/notificationState';
import { ToastContainer } from '../components/ui/ToastContainer';
import NotificationBell from '../components/ui/NotificationBell';
import { errorMessage } from '../api';

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────── motor (hook) ───────────────────────────

describe('Notificaciones · motor', () => {
  it('las informativas se cierran solas tras su duración', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('Producto guardado'); });
    expect(result.current.toasts).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(DEFAULT_DURATIONS.success); });
    expect(result.current.toasts[0].leaving).toBe(true);
    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('las críticas NO se cierran solas', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => { result.current.notify.critical({ title: 'Pago rechazado', message: 'Reintenta' }); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].duration).toBeNull();
    expect(result.current.pendingCritical).toBe(1);
  });

  it('pausar detiene la cuenta regresiva y reanudar la continúa', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    let id;
    act(() => { id = result.current.showToast('Hola', 'info'); });
    act(() => { vi.advanceTimersByTime(2000); result.current.pause(id); });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].paused).toBe(true);

    act(() => { result.current.resume(id); });
    act(() => { vi.advanceTimersByTime(DEFAULT_DURATIONS.info - 2000 + EXIT_MS); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('agrupa las repetidas en lugar de apilarlas', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Sin conexión', 'error');
      result.current.showToast('Sin conexión', 'error');
      result.current.showToast('Sin conexión', 'error');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].count).toBe(3);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].count).toBe(3);
  });

  it('no repite como error lo que ya muestra una crítica', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.notify.critical({ title: 'Solo lectura', message: 'Tu plan venció' });
      result.current.showToast('Tu plan venció', 'error');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('critical');
  });

  it('acepta notificaciones desde fuera de React (emitNotification)', () => {
    const { result } = renderHook(() => useToast());
    act(() => { emitNotification({ type: 'warning', message: 'Stock bajo' }); });
    expect(result.current.toasts[0]).toMatchObject({ type: 'warning', message: 'Stock bajo' });
  });

  it('el historial cuenta no leídas; limpiar conserva las críticas pendientes', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Uno');
      result.current.notify.critical({ message: 'Pago rechazado' });
    });
    expect(result.current.unreadCount).toBe(2);

    act(() => { result.current.markAllRead(); });
    expect(result.current.unreadCount).toBe(0);

    act(() => { result.current.clearHistory(); });
    expect(result.current.history.map((h) => h.message)).toEqual(['Pago rechazado']);
  });

  it('resolver una crítica la quita de la pila y de las pendientes', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    let id;
    act(() => { id = result.current.notify.critical({ message: 'Pago rechazado' }); });
    act(() => { result.current.resolve(id); vi.advanceTimersByTime(EXIT_MS); });
    expect(result.current.toasts).toHaveLength(0);
    expect(result.current.pendingCritical).toBe(0);
  });

  it('el historial tiene un tope', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      for (let i = 0; i < HISTORY_LIMIT + 10; i++) result.current.showToast(`n${i}`);
    });
    expect(result.current.history).toHaveLength(HISTORY_LIMIT);
  });

  it('ordena: críticas primero y luego la informativa más reciente', () => {
    const list = [
      { id: 1, type: 'success' }, { id: 2, type: 'critical' }, { id: 3, type: 'info' }, { id: 4, type: 'critical' },
    ];
    expect(orderToasts(list).map((t) => t.id)).toEqual([2, 4, 3, 1]);
  });
});

// ─────────────────────────── interfaz ───────────────────────────

function Harness({ children, seed }) {
  const n = useToast();
  return (
    <NotificationContext.Provider value={n}>
      <button type="button" onClick={() => seed(n)}>sembrar</button>
      {children}
    </NotificationContext.Provider>
  );
}

function renderUI(seed, extra = null) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Harness seed={seed}>
        <Routes>
          <Route path="/" element={<><NotificationBell />{extra}</>} />
          <Route path="/billing" element={<p>Página de facturación</p>} />
        </Routes>
        <ToastContainer />
      </Harness>
    </MemoryRouter>
  );
}

describe('Notificaciones · interfaz', () => {
  it('muestra la crítica con su acción y navega al usarla', () => {
    renderUI((n) => n.notify.critical({
      title: 'Tu cuenta está suspendida', message: 'Renueva para seguir', action: { label: 'Ver mi plan', href: '/billing' },
    }));
    fireEvent.click(screen.getByText('sembrar'));

    expect(screen.getByRole('alert')).toHaveTextContent('Requiere acción');
    expect(screen.getByRole('alert')).toHaveTextContent('Tu cuenta está suspendida');
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi plan' }));
    expect(screen.getByText('Página de facturación')).toBeInTheDocument();
  });

  it(`muestra como máximo ${MAX_VISIBLE} y resume el resto`, () => {
    renderUI((n) => ['a', 'b', 'c', 'd', 'e'].forEach((m) => n.showToast(m, 'info')));
    fireEvent.click(screen.getByText('sembrar'));
    expect(screen.getAllByRole('status')).toHaveLength(MAX_VISIBLE);
    expect(screen.getByRole('button', { name: /\+2 más/ })).toBeInTheDocument();
  });

  it('las tarjetas no usan StockMindGlass (solo el asistente) y tienen botón para cerrar', () => {
    const { container } = renderUI((n) => n.showToast('Venta registrada'));
    fireEvent.click(screen.getByText('sembrar'));
    expect(container.querySelector('.ntf-item .ntf-surface')).not.toBeNull();
    expect(document.querySelector('.ntf-item glass-element')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar notificación' })).toBeInTheDocument();
  });

  it('el panel de la campana tampoco usa StockMindGlass', () => {
    renderUI(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    const panel = screen.getByRole('dialog');
    expect(panel.querySelector('.ntf-panel-surface')).not.toBeNull();
    expect(panel.querySelector('glass-element')).toBeNull();
  });

  it('la campana cuenta las no leídas y las marca al cerrar el panel', () => {
    renderUI((n) => { n.showToast('Uno'); n.showToast('Dos', 'warning'); });
    fireEvent.click(screen.getByText('sembrar'));

    const bell = screen.getByRole('button', { name: /Notificaciones, 2 sin leer/ });
    fireEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Centro de notificaciones' });
    expect(panel).toHaveTextContent('Uno');
    expect(panel).toHaveTextContent('Dos');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
  });

  it('la campana muestra un estado vacío amable', () => {
    renderUI(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Todo en orden');
  });
});

// ─────────────────────────── mensajes de error (api.js) ───────────────────────────

describe('Notificaciones · mensajes de error legibles', () => {
  it('usa el mensaje del gateway cuando existe', () => {
    expect(errorMessage(400, { error: 'El SKU ya existe' })).toBe('El SKU ya existe');
  });

  it('no muestra HTML ni respuestas vacías', () => {
    expect(errorMessage(502, '<html><body>Bad Gateway</body></html>')).toMatch(/servidor tuvo un problema/);
    expect(errorMessage(404, '')).toBe('No encontramos lo que buscas.');
    expect(errorMessage(418, null)).toBe('No se pudo completar la operación.');
  });

  it('conserva un texto corto y legible', () => {
    expect(errorMessage(400, 'Cantidad inválida')).toBe('Cantidad inválida');
  });
});
