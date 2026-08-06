'use client';

import defaults from '@/config/bestPracticesDefault.json';

export interface BestPracticeStage {
  key: string;
  order: number;
  label: string;
  color: 'sky' | 'indigo' | 'violet' | 'rose' | 'emerald' | 'amber' | 'slate';
}

export interface BestPracticePoint {
  text: string;
  impact?: string;
}

export interface BestPractice {
  id: string;
  stage: string;
  title: string;
  summary: string;
  points: BestPracticePoint[];
  sourceUrl: string;
  sourceName: string;
  publishDate?: string;
  addedDate: string;
}

export interface BestPracticesConfig {
  meta: { version: string; lastUpdated: string };
  stages: BestPracticeStage[];
  practices: BestPractice[];
}

// Read-only by design, same pattern as useSkills() - this is a curated reference library the
// user grows over time by handing over new source links (see the best-practices-add skill),
// not something edited freely from the browser.
export function useBestPractices() {
  return { config: defaults as BestPracticesConfig };
}
