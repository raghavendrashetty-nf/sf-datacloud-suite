'use client';

import { useCallback, useEffect, useState } from 'react';
import defaults from '@/config/skillsDefault.json';
import type { SkillsConfig } from '@/lib/types';

export const SKILLS_OVERRIDE_KEY = 'sfdc.skills.override.v1';

function readOverlay(): Partial<SkillsConfig> | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(SKILLS_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function mergeOverlay(base: SkillsConfig, overlay: Partial<SkillsConfig> | null): SkillsConfig {
  if (!overlay) return base;
  return {
    meta: { ...base.meta, ...(overlay.meta ?? {}) },
    skills: Array.isArray(overlay.skills) ? overlay.skills : base.skills
  };
}

export function useSkills() {
  const [skills, setSkillsState] = useState<SkillsConfig>(defaults as SkillsConfig);
  useEffect(() => {
    const overlay = readOverlay();
    if (overlay) setSkillsState(mergeOverlay(defaults as SkillsConfig, overlay));
  }, []);
  const setSkills = useCallback((next: SkillsConfig) => {
    setSkillsState(next);
    try { window.localStorage.setItem(SKILLS_OVERRIDE_KEY, JSON.stringify(next)); } catch {}
  }, []);
  const resetSkills = useCallback(() => {
    try { window.localStorage.removeItem(SKILLS_OVERRIDE_KEY); } catch {}
    setSkillsState(defaults as SkillsConfig);
  }, []);
  return { skills, setSkills, resetSkills };
}
