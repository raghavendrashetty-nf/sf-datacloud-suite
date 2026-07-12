import Link from 'next/link';

export default function Header() {
  return (
    <header className="no-print sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-500 to-indigo-500" />
          Salesforce Data Cloud Suite
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">Home</Link>
          <Link href="/credit-calculator" className="text-slate-600 hover:text-slate-900">Credit Calculator</Link>
          <Link href="/data-readiness" className="text-slate-600 hover:text-slate-900">Data Readiness</Link>
        </nav>
      </div>
    </header>
  );
}
