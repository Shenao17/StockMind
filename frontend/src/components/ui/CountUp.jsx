import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** CountUp — La cifra cuenta desde cero hasta su valor (900 ms, frenado suave). Sin movimiento si el sistema lo pide. */
export default function CountUp({ value, format = (v) => String(v), duration = 900 }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(() => (reduced() ? target : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reduced()) return undefined;
    const start = performance.now();
    const origin = from.current;
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = origin + (target - origin) * eased;
      setShown(p < 1 ? v : target);
      from.current = p < 1 ? v : target;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <>{format(Math.round(reduced() ? target : shown))}</>;
}
