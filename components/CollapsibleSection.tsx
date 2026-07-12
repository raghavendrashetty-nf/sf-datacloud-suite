'use client';

import { ReactNode, useState } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsibleSection({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 mt-3 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left text-xs font-semibold text-slate-600 hover:text-slate-900"
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="mt-2 text-xs text-slate-600 space-y-1">{children}</div> : null}
    </div>
  );
}
