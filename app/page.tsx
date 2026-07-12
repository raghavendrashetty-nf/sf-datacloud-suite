import Link from 'next/link';
import Header from '@/components/Header';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-4xl w-full text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">
            Salesforce Data Cloud Suite - v4.5
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
            Prepare your data for <span className="text-sky-600">Data Cloud</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Two tools to accelerate your Salesforce Data Cloud (Data 360) discovery
            and onboarding journey - credit consumption forecasting and source-system
            data readiness assessment.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full">
          <Link
            href="/credit-calculator"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all p-8"
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-500 to-indigo-500" />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center mb-5 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-7 h-7 text-white">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <line x1="8" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="12" y2="14" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-semibold uppercase tracking-wider">
              Feature 1
            </div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              Credit Consumption Calculator
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Estimate your Data Cloud credit consumption and USD cost based on
              the official Salesforce Platform Services rate sheet.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-sky-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Open Calculator
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-4 h-4">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>

          <Link
            href="/data-readiness"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all p-8"
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-5 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-7 h-7 text-white">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold uppercase tracking-wider">
              Feature 2
            </div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              Data Readiness Assessment
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Connect to a live Salesforce org and run real data quality checks:
              duplicates, NULL/empty analysis, completeness, distribution, and more.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-emerald-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Start Assessment
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="w-4 h-4">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-slate-400">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
