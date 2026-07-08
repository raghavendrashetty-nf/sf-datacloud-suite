"use client";
import Link from "next/link";
export function Header({ title, subtitle, badge, children }: { title: string; subtitle: string; badge?: string; children?: React.ReactNode }) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 no-print">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Home</Link>
          <div className="border-l border-slate-200 pl-4">
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {children}
          {badge && <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{badge}</span>}
        </div>
      </div>
    </header>
  );
}
