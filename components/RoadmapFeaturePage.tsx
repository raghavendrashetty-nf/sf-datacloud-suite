import Link from 'next/link';
import Header from '@/components/Header';

export interface RoadmapStep { title: string; description: string; }

interface Props {
  eyebrow: string;
  title: string;
  badge: string;
  badgeColor: 'amber' | 'slate';
  gradient: string;
  icon: React.ReactNode;
  tagline: string;
  steps: RoadmapStep[];
  note?: string;
}

export default function RoadmapFeaturePage({ eyebrow, title, badge, badgeColor, gradient, icon, tagline, steps, note }: Props) {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="max-w-3xl w-full">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Home
          </Link>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className={`h-2 bg-gradient-to-r ${gradient}`} />
            <div className="p-8">
              <div className="flex items-start gap-4 flex-wrap">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md shrink-0`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{eyebrow}</span>
                    <span className={`chip font-bold ${badgeColor === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{badge}</span>
                  </div>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
                  <p className="mt-2 text-slate-600 leading-relaxed">{tagline}</p>
                </div>
              </div>

              <div className="mt-8">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">How it will work</h2>
                <ol className="space-y-4">
                  {steps.map((step, i) => (
                    <li key={step.title} className="flex gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{step.title}</div>
                        <div className="text-sm text-slate-600 mt-0.5 leading-relaxed">{step.description}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {note ? (
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 leading-relaxed">
                  {note}
                </div>
              ) : null}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            This feature is on the roadmap and not yet available. Explore what's live today:{' '}
            <Link href="/credit-calculator" className="underline hover:text-slate-700">Credit Calculator</Link>{' '}or{' '}
            <Link href="/data-readiness" className="underline hover:text-slate-700">Data Readiness Assessment</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
