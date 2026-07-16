'use client';

import { useState } from 'react';
import type { DocLink } from '@/lib/refreshModes';

interface Props {
  description: string;
  docs?: DocLink[];
  label?: string;
}

export default function InfoTooltip({ description, docs = [], label = 'More info' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label={label}
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 hover:bg-sky-200 hover:text-sky-800 text-[10px] font-bold flex items-center justify-center leading-none shrink-0"
      >
        i
      </button>
      {open ? (
        <div className="absolute z-30 top-5 left-0 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-2.5 text-left">
          <p className="text-[11px] text-slate-600 leading-snug">{description}</p>
          {docs.length > 0 ? (
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
              {docs.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  onMouseDown={(e) => e.preventDefault()}
                  className="block text-[10px] text-sky-600 hover:text-sky-800 hover:underline leading-snug"
                >
                  {d.label} ↗
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
