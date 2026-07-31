#!/usr/bin/env node
/**
 * Syncs config/skillsDefault.json against the real, official Salesforce
 * Data 360 skill library (github.com/forcedotcom/sf-skills).
 *
 * This does NOT auto-rewrite the curated `whenToUse`/`bestPractices` text -
 * those fields are hand-adapted from the source SKILL.md (which is written
 * for a CLI-driving coding agent, not for grounding a SOW-analysis prompt),
 * and mechanically regenerating them would silently degrade curation
 * quality. Instead this script:
 *   1. Fetches the current SKILL.md for every tracked skill and hashes it.
 *   2. Flags drift (hash changed since last sync) so a human re-reviews the
 *      source and updates the curated fields deliberately.
 *   3. Flags any new "data360-" or "d360"-named skill directories upstream
 *      that aren't in our library yet.
 *   4. Records source commit + sync timestamp so the app can show "synced
 *      against commit X on date Y" instead of an unverifiable static file.
 *
 * Run: npm run sync-skills
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'forcedotcom/sf-skills';
const SKILLS_JSON_PATH = path.join(__dirname, '..', 'config', 'skillsDefault.json');

// Maps our skill id -> the skill's directory name in the sf-skills repo.
const TRACKED = {
  skill_data360_connect: 'data360-connect',
  skill_data360_prepare: 'data360-prepare',
  skill_data360_harmonize: 'data360-harmonize',
  skill_data360_schema_get: 'data360-schema-get',
  skill_data360_segment: 'data360-segment',
  skill_data360_calculated_insights: 'data360-segment',
  skill_data360_activate: 'data360-activate',
  skill_data360_query: 'data360-query',
  skill_data360_orchestrate: 'data360-orchestrate',
  skill_data360_code_extension: 'data360-code-extension-generate',
  skill_agentforce_d360_analyze: 'agentforce-d360-analyze'
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'sf-datacloud-suite-skill-sync' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'sf-datacloud-suite-skill-sync' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function main() {
  console.log(`Syncing skill library against github.com/${REPO} ...`);
  const headCommit = await fetchJson(`https://api.github.com/repos/${REPO}/commits/main`);
  const sourceCommit = headCommit.sha;
  console.log(`HEAD commit: ${sourceCommit}`);

  const config = JSON.parse(fs.readFileSync(SKILLS_JSON_PATH, 'utf8'));
  const now = new Date().toISOString();
  let drifted = 0;
  let checked = 0;

  for (const skill of config.skills) {
    const dir = TRACKED[skill.id];
    if (!dir) continue; // not github-sourced (e.g. the SOW review framework skill)
    const raw = await fetchText(`https://raw.githubusercontent.com/${REPO}/main/skills/${dir}/SKILL.md`);
    const sourceHash = hash(raw);
    checked++;
    if (skill.sourceHash && skill.sourceHash !== sourceHash) {
      drifted++;
      console.warn(`\n⚠ DRIFT: ${skill.id} (skills/${dir}/SKILL.md changed upstream since last sync).`);
      console.warn(`  Re-read the source and manually review whenToUse/bestPractices for accuracy: https://github.com/${REPO}/blob/main/skills/${dir}/SKILL.md`);
    }
    skill.sourceHash = sourceHash;
    skill.sourceCheckedAt = now;
  }

  // Discover new Data 360 / Agentforce-D360 skill directories not yet tracked.
  const listing = await fetchJson(`https://api.github.com/repos/${REPO}/contents/skills`);
  const trackedDirs = new Set(Object.values(TRACKED));
  const candidates = listing
    .filter((entry) => entry.type === 'dir')
    .map((entry) => entry.name)
    .filter((name) => (name.startsWith('data360-') || name.includes('d360')) && !trackedDirs.has(name));
  if (candidates.length) {
    console.warn(`\n⚠ NEW UPSTREAM SKILL(S) not yet in our library - review and add manually if relevant:`);
    for (const name of candidates) console.warn(`  - skills/${name}/SKILL.md`);
  }

  config.meta = {
    ...config.meta,
    source: `https://github.com/${REPO}`,
    sourceCommit,
    syncedAt: now
  };

  fs.writeFileSync(SKILLS_JSON_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\nChecked ${checked} skill(s) against source. Drifted: ${drifted}. New candidates: ${candidates.length}.`);
  console.log(`Wrote updated meta to ${path.relative(process.cwd(), SKILLS_JSON_PATH)}`);
}

main().catch((err) => {
  console.error('Skill sync failed:', err.message);
  process.exit(1);
});
