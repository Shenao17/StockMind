import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useDebounce } from '../hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('devuelve el valor inicial de inmediato', () => {
    const { result } = renderHook(() => useDebounce('a', 300));
    expect(result.current).toBe('a');
  });

  it('actualiza solo cuando el valor deja de cambiar', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: 'a' } });

    rerender({ v: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');

    rerender({ v: 'abc' });            // reinicia la espera
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('abc');
  });
});
