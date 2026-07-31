import Link from 'next/link';
import Header from '@/components/Header';

function ArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

type StageStatus = 'live' | 'planned' | 'exploratory';

const STATUS_STYLES: Record<StageStatus, { dot: string; chip: string; label: string }> = {
  live: { dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', label: 'Live' },
  planned: { dot: 'bg-amber-400', chip: 'bg-amber-100 text-amber-700', label: 'Planned' },
  exploratory: { dot: 'bg-slate-400', chip: 'bg-slate-200 text-slate-600', label: 'Exploratory' }
};

function StageHeader({ number, name, status }: { number: number; name: string; status: StageStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <div className="flex items-center gap-3">
      <span className={`w-9 h-9 rounded-full ${s.dot} text-white font-bold flex items-center justify-center text-sm shrink-0`}>{number}</span>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Stage {number}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-slate-900">{name}</h2>
          <span className={`chip font-semibold ${s.chip}`}>{s.label}</span>
        </div>
      </div>
    </div>
  );
}

function StageConnector() {
  return <div className="w-px h-8 bg-slate-200 ml-[1.125rem] my-1" aria-hidden="true" />;
}

function LiveToolCard({ href, gradient, icon, title, badge, badgeClass, description, cta }: {
  href: string; gradient: string; icon: React.ReactNode; title: string; badge?: string; badgeClass?: string;
  description: string; cta: string;
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all p-6 flex flex-col">
      <div className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${gradient}`} />
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-md`}>{icon}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {badge ? <span className={`chip font-semibold ${badgeClass}`}>{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 group-hover:gap-3 transition-all">
        {cta} <ArrowIcon />
      </div>
    </Link>
  );
}

function RoadmapToolCard({ href, gradient, icon, title, status, description }: {
  href: string; gradient: string; icon: React.ReactNode; title: string; status: StageStatus; description: string;
}) {
  const s = STATUS_STYLES[status];
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-300 bg-slate-50/60 hover:bg-white transition-all p-6 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} opacity-90 flex items-center justify-center mb-4 shadow-sm`}>{icon}</div>
        <span className={`chip font-bold ${s.chip}`}>{s.label}</span>
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 group-hover:text-slate-900 group-hover:gap-3 transition-all">
        View Roadmap <ArrowIcon />
      </div>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-4xl w-full text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">
            NeuraFlash Data Cloud Suite - v4.8
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
            An end-to-end toolkit for <span className="text-sky-600">Data Cloud</span> projects
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
            From Discovery through Deployment - one suite spanning every stage of a
            Salesforce Data Cloud (Data 360) engagement.
          </p>
        </div>

        <div className="mt-16 w-full max-w-6xl space-y-2">

          <StageHeader number={1} name="Discovery" status="live" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pl-0 md:pl-[3rem]">
            <LiveToolCard
              href="/credit-calculator"
              gradient="from-sky-500 to-indigo-500"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="12" y2="14" />
                </svg>
              )}
              title="Credit Calculator - Basic"
              badge="Simple" badgeClass="bg-sky-100 text-sky-700"
              description="Estimate credit consumption and USD cost from the official Platform Services rate sheet."
              cta="Open Calculator"
            />
            <LiveToolCard
              href="/credit-calculator/advanced"
              gradient="from-indigo-500 to-violet-500"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /><circle cx="12" cy="12" r="4" />
                </svg>
              )}
              title="Credit Calculator - Advanced"
              badge="New" badgeClass="bg-indigo-100 text-indigo-700"
              description="Model Refresh Mode &amp; Run Frequency per phase and build out real Data Ingestion pipelines."
              cta="Open Advanced"
            />
            <LiveToolCard
              href="/data-readiness"
              gradient="from-emerald-500 to-teal-500"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              )}
              title="Data Readiness Assessment"
              description="Connect to a live org and run real data quality checks: duplicates, NULL/empty, completeness, distribution, and more."
              cta="Start Assessment"
            />
          </div>

          <StageConnector />

          <StageHeader number={2} name="Solution Design" status="live" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:pl-[3rem]">
            <LiveToolCard
              href="/solution-recommender"
              gradient="from-violet-500 to-fuchsia-500"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M12 2a7 7 0 00-4 12.7V17a2 2 0 002 2h4a2 2 0 002-2v-2.3A7 7 0 0012 2z" /><line x1="9" y1="21" x2="15" y2="21" />
                </svg>
              )}
              title="AI Solution Recommender"
              badge="New" badgeClass="bg-violet-100 text-violet-700"
              description="SOW / Discovery Doc + Data 360 Skills → design recommendation with SWOT &amp; cost analysis, via Claude or a local free LLM."
              cta="Open Recommender"
            />
          </div>

          <StageConnector />

          <StageHeader number={3} name="Implementation Review" status="live" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:pl-[3rem]">
            <LiveToolCard
              href="/org-scanner"
              gradient="from-teal-500 to-cyan-500"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
              title="AI Org Scanner"
              badge="New" badgeClass="bg-teal-100 text-teal-700"
              description="Connects to a live Data 360 instance, scans existing configuration, estimates credit consumption, and reviews it against best practices or a SOW - with justified recommendations."
              cta="Open Scanner"
            />
          </div>

          <StageConnector />

          <StageHeader number={4} name="Deployment" status="exploratory" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:pl-[3rem]">
            <RoadmapToolCard
              href="/deployment-assistant"
              gradient="from-slate-600 to-slate-800"
              icon={(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h8" /><path d="M6 12h.01M10 12h8" /><path d="M6 16h.01M10 16h8" />
                </svg>
              )}
              title="AI Deployment Assistant"
              status="exploratory"
              description="Automate promoting Data Cloud configuration between environments - exploring the Metadata API, DataKit, and CLI-based approaches."
            />
          </div>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-slate-500">
        Not affiliated with Salesforce.
      </footer>
    </main>
  );
}
