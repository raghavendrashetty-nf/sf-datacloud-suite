'use client';

interface Step { key: string; label: string; }
interface Props { steps: Step[]; currentIndex: number; onStepClick?: (index: number) => void; }

export default function StepIndicator({ steps, currentIndex, onStepClick }: Props) {
  return (
    <ol className="flex items-center gap-2 flex-wrap">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const isFuture = i > currentIndex;
        const clickable = !isFuture && !!onStepClick;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <button type="button" disabled={!clickable}
              onClick={() => clickable && onStepClick?.(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isCurrent ? 'bg-emerald-600 text-white shadow'
                : isDone ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-400'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                isCurrent ? 'bg-white/20' : isDone ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400'
              }`}>
                {isDone ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (i + 1)}
              </span>
              {step.label}
            </button>
            {i < steps.length - 1 ? <span className={`w-6 h-0.5 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
