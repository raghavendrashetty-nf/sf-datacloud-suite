'use client';

import { ReactNode, useState } from 'react';

interface Props { title: string; children: ReactNode; defaultOpen?: boolean; }

export default function CollapsibleSection({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 transition-colors px-3 py-2 text-left"
        aria-expanded={open}>
        <span className="w-6 h-6 rounded-full bg-indigo-200 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`w-3.5 h-3.5 text-indigo-700 transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <span className="font-bold text-sm text-slate-900">{title}</span>
        <span className="text-indigo-600 text-xs font-medium">{open ? 'Click to collapse' : 'Click to expand'}</span>
      </button>
      {open ? <div className="mt-2 px-1 text-xs text-slate-600 space-y-1">{children}</div> : null}
    </div>
  );
}
