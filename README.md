# NeuraFlash Data Cloud Suite - v4.7

Production-ready Next.js 14 (App Router, TypeScript strict) tool with two features:

1. **Credit Consumption Calculator** - estimate Salesforce Data Cloud credit
   consumption and USD cost. Rate sheet matches the Nov 2025 PDF exactly:
   6 categories, 21 items including Intelligent Processing.
2. **Data Readiness Assessment** - connect to a live Salesforce org via
   jsforce and run real SOQL data quality checks against any object & field
   in your org (metadata auto-discovered live).

## Local Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

No `npm install canvas` needed - webpack alias handles it.

## Rate sheet (matches Nov 2025 PDF)

| # | Phase | Items |
|---|---|---|
| 1 | Connect, Harmonize, and Unify | 11 |
| 2 | E2E Real-Time Processing | 1 |
| 3 | Analyze & Predict | 3 |
| 4 | Act | 2 |
| 5 | Segmentation & Activation | 3 |
| 6 | Compute | 1 |
| **Total** | | **21** |

## Data Readiness user journey

1. Home -> Data Readiness
2. Pick Salesforce
3. Enter credentials (Sandbox users end in `.sandboxname`)
4. Pick a check (Duplicate, NULL/Empty, Completeness, Distribution, Format, Ref Integrity)
5. Object dropdown loads live from your org via describeGlobal()
6. Field dropdown loads live via sobject.describe(), filtered to check-compatible types
7. Run - real SOQL executes - LIVE badge on the results

Credentials are stored only in server memory (`globalThis.__sfCache`).

## Troubleshooting the "Module not found: Can't resolve './globals.css'" error

If you see this at dev startup, it means the zip you unzipped only contained a
patch (a few files), not the full project. Use this v4.7 full zip instead - it
has all 50 files including `app/globals.css`.
