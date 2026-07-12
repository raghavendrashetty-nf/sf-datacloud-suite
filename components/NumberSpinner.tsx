'use client';

import { ChangeEvent, FocusEvent, useEffect, useState } from 'react';

interface Props { value: number; onChange: (n: number) => void; ariaLabel: string; suffix?: string; min?: number; }

function stepFor(v: number): number {
  const a = Math.abs(v);
  if (a < 10) return 1;
  if (a < 100) return 10;
  if (a < 1000) return 100;
  if (a < 10000) return 1000;
  if (a < 100000) return 10000;
  return 100000;
}

export default function NumberSpinner({ value, onChange, ariaLabel, suffix, min = 0 }: Props) {
  const [display, setDisplay] = useState<string>(value === 0 ? '' : String(value));

  useEffect(() => {
    if (value === 0) setDisplay((prev) => (prev === '' || Number(prev) === 0 ? prev : ''));
    else setDisplay(String(value));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setDisplay(raw);
    if (raw === '' || raw === '.') onChange(0);
    else { const n = Number(raw); if (!isNaN(n)) onChange(Math.max(min, n)); }
  }
  function handleFocus(e: FocusEvent<HTMLInputElement>) { e.target.select(); }
  function handleBlur() { if (display.endsWith('.')) setDisplay(display.slice(0, -1)); }
  function dec() {
    const current = Number(display) || 0;
    const s = stepFor(current);
    const next = Math.max(min, Math.round((current - s) * 100) / 100);
    setDisplay(next === 0 ? '' : String(next));
    onChange(next);
  }
  function inc() {
    const current = Number(display) || 0;
    const s = stepFor(current);
    const next = Math.max(min, Math.round((current + s) * 100) / 100);
    setDisplay(String(next));
    onChange(next);
  }

  return (
    <div className="flex items-stretch rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-sky-400">
      <button type="button" onClick={dec} aria-label={`Decrease ${ariaLabel}`}
        className="px-2 text-slate-500 hover:bg-slate-100 shrink-0">-</button>
      <input type="text" inputMode="numeric" value={display}
        onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
        placeholder="0" aria-label={ariaLabel}
        className="flex-1 min-w-0 w-full text-right px-2 py-1.5 text-sm outline-none tabular-nums placeholder:text-slate-300" />
      {suffix ? (
        <span className="px-2 flex items-center text-xs text-slate-500 border-l border-slate-200 bg-slate-50 shrink-0">{suffix}</span>
      ) : null}
      <button type="button" onClick={inc} aria-label={`Increase ${ariaLabel}`}
        className="px-2 text-slate-500 hover:bg-slate-100 border-l border-slate-200 shrink-0">+</button>
    </div>
  );
}
