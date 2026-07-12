'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableItem {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface Props {
  label: string;
  placeholder?: string;
  items: SearchableItem[];
  value: string | null;
  onChange: (value: string | null) => void;
  emptyMessage?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  label, placeholder = 'Type to search...',
  items, value, onChange,
  emptyMessage = 'No results',
  disabled = false
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => i.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items
      .filter((it) =>
        it.label.toLowerCase().includes(q) ||
        it.value.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [items, query]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Reset highlight when filter changes
  useEffect(() => { setHighlighted(0); }, [query]);

  // Sync display when value changes externally
  useEffect(() => {
    if (!open) setQuery(selectedItem?.label ?? '');
  }, [selectedItem, open]);

  function commit(item: SearchableItem | null) {
    onChange(item?.value ?? null);
    setQuery(item?.label ?? '');
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[highlighted];
      if (it) commit(it);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (selectedItem?.label ?? '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors ${
            disabled
              ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
              : 'border-slate-300 bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200'
          }`}
        />
        {selectedItem && !open ? (
          <button
            type="button"
            onClick={() => { commit(null); inputRef.current?.focus(); }}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400 italic">{emptyMessage}</li>
          ) : filtered.map((item, i) => (
            <li
              key={item.value}
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => { e.preventDefault(); commit(item); }}
              className={`px-3 py-2 cursor-pointer flex items-start gap-2 ${
                i === highlighted ? 'bg-emerald-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{item.label}</div>
                {item.description ? (
                  <div className="text-[11px] text-slate-500 truncate">{item.description}</div>
                ) : null}
              </div>
              {item.badge ? (
                <span className="chip bg-slate-100 text-slate-600 text-[10px] shrink-0 self-center">
                  {item.badge}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
