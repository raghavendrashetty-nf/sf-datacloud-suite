'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function ChevronDown({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface NavItem { href: string; label: string; }

// Every currently-working feature, in the same order the homepage's Discovery -> Solution
// Design -> Implementation Review pipeline presents them - Deployment Assistant is
// intentionally excluded, it's still a roadmap placeholder (RoadmapFeaturePage), not a working
// tool, per the "only working features" instruction.
const CALCULATOR_ITEMS: NavItem[] = [
  { href: '/credit-calculator', label: 'Basic' },
  { href: '/credit-calculator/advanced', label: 'Advanced' }
];
const SIMPLE_ITEMS: NavItem[] = [
  { href: '/data-readiness', label: 'Data Readiness' },
  { href: '/solution-recommender', label: 'Solution Recommender' },
  { href: '/org-scanner', label: 'Org Scanner' }
];

function NavLink({ href, label, active }: NavItem & { active: boolean }) {
  return (
    <Link href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}>
      {label}
    </Link>
  );
}

function CalculatorDropdown({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          active ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}>
        Credit Calculator
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-1.5 min-w-[180px] rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-50">
          {CALCULATOR_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-700">
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const calculatorActive = pathname?.startsWith('/credit-calculator') ?? false;

  return (
    <header className="no-print sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 to-indigo-500" />
          NeuraFlash Data Cloud Suite
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Home" active={pathname === '/'} />
          <CalculatorDropdown active={calculatorActive} />
          {SIMPLE_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} />
          ))}
        </nav>
      </div>
    </header>
  );
}
