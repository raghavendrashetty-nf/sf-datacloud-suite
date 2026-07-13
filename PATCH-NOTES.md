# sf-datacloud-suite v4.8 - Data Readiness accuracy & UX overhaul

Apply on top of a working v4.7 install.

## What changed

### Credit Calculator
- **Phase chip removed** from each Item Card - no more overlap with the item title. The phase is still shown in the section header at the top of the card group.

### Data Readiness

#### 1. NULL/Empty double-counting bug (fixed)
The old runner did `nullCount = SOQL(field = NULL) + SOQL(field = '')`. In
Salesforce SOQL, empty text values are stored as NULL, so both queries return
the SAME rows and adding them produced 200%+ rates.

**New behaviour:** we only run one COUNT query and report:
- `nullCount` from `WHERE field = NULL` (the only accurate SF count)
- `emptyCount = 0` (documented as expected in SF)
- `nullPercent = nullCount / totalRecords` (now bounded 0-100)

For your Contact.alt_email__c case (1,057,999 nulls / 1,551,165 total), the
tool now correctly reports **68.2%** instead of the buggy 136.4%.

#### 2. No more LIMIT on primary counts
All check runners have been rewritten to iterate the full table using
jsforce's `queryMore()` cursor pagination:

| Check | Before | After |
|---|---|---|
| Duplicate | `... LIMIT 100` for entire count | GROUP BY paginated to completion + separate top-100 for display |
| Format Validation | `... LIMIT 2000` sample scaled to total | Paginated over ALL non-NULL rows, batch size 2000 |
| Referential Integrity | `LIMIT 500` distinct FK ids | GROUP BY paginated to completion, parent lookup chunked by 800 ids per IN() |
| Value Distribution | `LIMIT 10` | `LIMIT 10` (unchanged - only top values are needed) |

Every runner returns `fullTableAnalyzed: true` and results carry a green
**FULL SCAN** badge in the headline card.

#### 3. Backend operations console
Every check now returns a `backendLog: string[]` with a timestamped entry for
every operation the server executed - SOQL fired, page cursors, calculations,
retry attempts, chunk sizes.

Shown as a second collapsible console below "Query used" in the results view,
rendered in a dark terminal-style panel.

#### 4. Rich Check Cards with expandable info
The 6 check cards on the "Select a check" step now come with a "How this check
works" expandable section that shows:
- **What** the check does in plain English
- **How** it is executed (SOQL queries, pagination strategy, calculations)
- **Outcomes** returned and how to interpret them
- **Use cases** for Data Cloud discovery
- Ideal fit / when to skip

Definitions live in `lib/dataReadiness.ts` under `CHECK_META`.

#### 5. Object search prioritisation
The Salesforce Object dropdown now ranks matches so:
1. Exact name/label match (rank 0)
2. Starts-with match (rank 1)
3. Word-boundary match (rank 2)
4. Substring match (rank 3)
5. Description-only match (rank 4)

Typing `Contact` now returns **Contact** first, then **Account Contact Role**,
**Content Document**, etc. `SearchableSelect` was extended with an
`onQueryChange` callback to feed the current search text back to the wizard.

## Files changed (8)

| File | Kind |
|---|---|
| `package.json` | Modified (version 4.8.0) |
| `components/ItemCard.tsx` | Modified (phase chip removed) |
| `lib/dataReadiness.ts` | Modified (added CHECK_META + backendLog + fullTableAnalyzed) |
| `lib/salesforceClient.ts` | Modified (LIMIT-free runners, NULL fix, backend logging) |
| `app/api/data-readiness/check/route.ts` | Modified (forward backendLog) |
| `components/data-readiness/CheckCard.tsx` | New (rich cards) |
| `components/data-readiness/CheckResults.tsx` | Modified (backend log console, FULL SCAN badge) |
| `components/data-readiness/SearchableSelect.tsx` | Modified (onQueryChange callback) |
| `app/data-readiness/page.tsx` | Modified (uses CheckCard, prioritised object ranking) |

## How to apply

```bash
cd path/to/your/project
unzip -o sf-datacloud-suite-v4-8-patch.zip

cd sf-datacloud-suite
rm -rf .next
npm run dev
```

No new npm dependencies.
