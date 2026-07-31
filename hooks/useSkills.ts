'use client';

import defaults from '@/config/skillsDefault.json';
import type { SkillsConfig } from '@/lib/types';

// Read-only by design: this is the official Salesforce Data 360 skill library,
// kept in sync with github.com/forcedotcom/sf-skills via `npm run sync-skills`
// (see scripts/sync-skills.js). It is not user-editable or overridable from the
// browser - that was the source of a prior bug where locally-edited/stale skill
// data silently shadowed the real, GitHub-sourced library.
export function useSkills() {
  return { skills: defaults as SkillsConfig };
}
