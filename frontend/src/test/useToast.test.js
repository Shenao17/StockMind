import { renderHook, act } from '@testing-library/react';
import { useToast } from '../hooks/useToast';

describe('useToast', () => {
  it('inicia con lista de toasts vacía', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('agrega un toast al llamar showToast', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('Producto guardado', 'success'); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Producto guardado');
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('puede agregar múltiples toasts', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Éxito', 'success');
      result.current.showToast('Error', 'error');
      result.current.showToast('Advertencia', 'warning');
    });
    expect(result.current.toasts).toHaveLength(3);
  });

  it('usa tipo success por defecto', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('Mensaje sin tipo'); });
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('cada toast tiene un id único', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Toast 1');
      result.current.showToast('Toast 2');
    });
    const ids = result.current.toasts.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
