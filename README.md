# Salesforce Data Cloud Suite - v4.4

Production-ready Next.js 14 (App Router, TypeScript strict) tool with **two**
features:

1. **Credit Consumption Calculator** - estimate Salesforce Data Cloud (Data 360)
   credit consumption and USD cost during Discovery, based on the official rate
   sheet.
2. **Data Readiness Assessment** (new in v4.4) - assess source-system data
   quality before ingesting into Data Cloud. Run duplicate, NULL/empty,
   completeness, distribution, format, and referential integrity checks against
   any Salesforce or Zendesk object & field.

## What is new in v4.4

- **Landing page** now shows two hero banners - one per feature.
- **Data Readiness feature** (`/data-readiness`) with a 4-step wizard:
  1. Pick a source system (Salesforce or Zendesk)
  2. Pick a data quality check (duplicate, null/empty, completeness,
     value distribution, format validation, referential integrity)
  3. Type-to-search for an Object, then a Field on that object
     (fields are filtered to only those the selected check can apply to)
  4. Run and view rich results (headline metric, severity color, charts,
     example rows, sample query used)
- New API `POST /api/data-readiness/check` returns deterministic, realistic
  mock results based on `(system, checkType, object, field)` - swap the mock
  for real Salesforce / Zendesk API calls whenever you are ready.
- **Nothing in the Credit Calculator was changed.** All v4.3 fixes remain intact.

## Local Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

No extra dependencies needed (canvas alias is baked into `next.config.mjs`).

## Deploy to Railway (GitHub)

```bash
git init && git add . && git commit -m "v4.4"
git remote add origin https://github.com/<user>/sf-datacloud-suite.git
git push -u origin main
```

Railway auto-detects the Dockerfile. `ENV BUILD_STANDALONE=1` in the Dockerfile
produces the standalone bundle in-container.

## Data Readiness catalog

Source systems, objects, fields, and check definitions all live in
`config/dataReadinessCatalog.json`. To add a new system or check, edit that
file only - no code changes required.

## Formulas & rate sheet

See the Credit Calculator section - unchanged from v4.3.
