import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavIcon from '../ui/NavIcon';

/** CommandPalette — "Buscar o ir a…" (Ctrl/Cmd + K): filtra páginas, flechas para moverse, Enter para ir. */
export default function CommandPalette({ open, onClose, items }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.label.toLowerCase().includes(t)) : items;
  }, [q, items]);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;
  const go = (item) => { if (item) { navigate(item.to); onClose(); } };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') go(results[idx]);
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Buscar o ir a" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input">
          <NavIcon type="search" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ir a… (Dashboard, Ventas, Plan y pagos)" aria-label="Buscar página" />
        </div>
        <ul className="palette-list" role="listbox">
          {results.length === 0 && <li className="palette-empty">Sin resultados</li>}
          {results.map((i, n) => (
            <li key={i.to} role="option" aria-selected={n === idx} className={n === idx ? 'on' : ''}
              onMouseEnter={() => setIdx(n)} onClick={() => go(i)}>
              <NavIcon type={i.icon} /> {i.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
