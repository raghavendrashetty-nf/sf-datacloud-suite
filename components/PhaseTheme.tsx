import type { PhaseKey } from '@/lib/types';

export interface PhaseTheme {
  key: PhaseKey; order: number; label: string;
  color: 'sky' | 'indigo' | 'rose' | 'violet' | 'emerald' | 'amber' | 'cyan' | 'slate';
  hex: string;
}

// 6 phases matching the Nov 2025 rate sheet EXACTLY.
// Profile Unification is under "Connect, Harmonize, and Unify" - NOT a separate phase.
export const PHASES: PhaseTheme[] = [
  { key: 'ingestion',  order: 1, label: 'Connect, Harmonize, and Unify',    color: 'sky',     hex: '#0ea5e9' },
  { key: 'realtime',   order: 2, label: 'E2E Real-Time Processing',          color: 'rose',    hex: '#f43f5e' },
  { key: 'insights',   order: 3, label: 'Analyze & Predict',                 color: 'violet',  hex: '#8b5cf6' },
  { key: 'act',        order: 4, label: 'Act',                               color: 'emerald', hex: '#10b981' },
  { key: 'activation', order: 5, label: 'Segmentation & Activation',         color: 'amber',   hex: '#f59e0b' },
  { key: 'compute',    order: 6, label: 'Compute',                           color: 'cyan',    hex: '#06b6d4' }
];

const FALLBACK: PhaseTheme = { key: '__custom__', order: 99, label: 'Custom Phase', color: 'slate', hex: '#64748b' };
const GENERAL: PhaseTheme = { key: '__general__', order: 98, label: 'General / Cross-Phase', color: 'slate', hex: '#64748b' };

export function getPhaseTheme(key: PhaseKey): PhaseTheme {
  if (key === '__general__') return GENERAL;
  return PHASES.find((p) => p.key === key) ?? { ...FALLBACK, key, label: key || FALLBACK.label };
}
