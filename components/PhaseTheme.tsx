import type { PhaseKey } from '@/lib/types';

export interface PhaseTheme {
  key: PhaseKey; order: number; label: string;
  color: 'sky' | 'indigo' | 'rose' | 'violet' | 'emerald' | 'amber' | 'cyan' | 'slate';
  hex: string;
}

export const PHASES: PhaseTheme[] = [
  { key: 'ingestion',     order: 1, label: 'Connect, Harmonize & Unify',        color: 'sky',     hex: '#0ea5e9' },
  { key: 'harmonization', order: 2, label: 'Identity Resolution',               color: 'indigo',  hex: '#6366f1' },
  { key: 'realtime',      order: 3, label: 'End-to-End Real-Time Processing',   color: 'rose',    hex: '#f43f5e' },
  { key: 'insights',      order: 4, label: 'Analyze & Predict',                 color: 'violet',  hex: '#8b5cf6' },
  { key: 'act',           order: 5, label: 'Act',                               color: 'emerald', hex: '#10b981' },
  { key: 'activation',    order: 6, label: 'Segmentation & Activation',         color: 'amber',   hex: '#f59e0b' },
  { key: 'compute',       order: 7, label: 'Compute',                           color: 'cyan',    hex: '#06b6d4' }
];

const FALLBACK: PhaseTheme = { key: '__custom__', order: 99, label: 'Custom Phase', color: 'slate', hex: '#64748b' };

export function getPhaseTheme(key: PhaseKey): PhaseTheme {
  return PHASES.find((p) => p.key === key) ?? { ...FALLBACK, key, label: key || FALLBACK.label };
}
