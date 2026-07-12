# Salesforce Data Cloud Suite - v4.5

Next.js 14 (App Router, TypeScript strict) with two features:

1. **Credit Consumption Calculator** - estimate Salesforce Data Cloud (Data 360)
   credit consumption and USD cost based on the official rate sheet.
2. **Data Readiness Assessment** - connect to a **live Salesforce org** and run
   real data quality checks against any object & field.

## What's new in v4.5

- **Real Salesforce integration via jsforce v3.6.** The Data Readiness feature now
  runs real SOQL queries against your org instead of returning mock data.
- **New Connection Manager step** in the wizard. Enter username, password,
  security token, and pick a login endpoint (Production, Sandbox, or a Custom
  My Domain URL). Credentials are stored **only in server memory** for the
  current process - never on disk, never in your browser's localStorage.
- **LIVE / MOCK badge** on every check result so you can tell at a glance
  whether the numbers came from your org or from the built-in mock generator.
- Wizard has **5 steps for Salesforce** (System -> Connect -> Check -> Target -> Results)
  and 4 steps for Zendesk (still mock).
- Credit Calculator is unchanged from v4.3 - all fixes remain.

## Local Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

No extra dependencies needed. The `canvas` webpack alias is baked in so
pdfjs-dist works without `npm install canvas`.

## Deploy to Railway (GitHub)

```bash
git init && git add . && git commit -m "v4.5"
git remote add origin https://github.com/<user>/sf-datacloud-suite.git
git push -u origin main
```

Railway auto-detects the Dockerfile. `ENV BUILD_STANDALONE=1` in the Dockerfile
produces the standalone bundle in-container.

## Connecting to Salesforce

Click **Data Readiness** -> **Salesforce** -> fill in the form.

| Field | Example |
|---|---|
| Username | `migration@frontlineed.com.flprod.full` |
| Password | your normal password |
| Security Token | optional (needed unless IP is trusted) |
| Login Endpoint | Sandbox for `test.salesforce.com` |
| Instance URL | optional pin, e.g. `https://frontlineed--full.sandbox.my.salesforce.com` |

The connection is cached in the server process. Refresh the page and you stay
signed in. Click **Disconnect** to clear the cache.

## Real check implementations (SOQL)

| Check | SOQL used |
|---|---|
| Duplicate | `SELECT field, COUNT(Id) FROM Object GROUP BY field HAVING COUNT(Id) > 1 ORDER BY COUNT(Id) DESC LIMIT 100` |
| NULL/empty | `SELECT COUNT() FROM Object WHERE field = NULL` + empty-string count for text fields |
| Completeness | Combined NULL + empty ratio -> 0-100 score |
| Value Distribution | `SELECT field, COUNT(Id) FROM Object GROUP BY field ORDER BY COUNT(Id) DESC LIMIT 10` + `COUNT_DISTINCT(field)` |
| Format Validation | Sample up to 2000 rows and run regex validation client-side |
| Referential Integrity | Sample 500 distinct FK IDs, verify existence in the guessed parent object |

## Security notes

- Credentials live in server memory only (a `globalThis` cache).
- They are cleared when the Node process restarts or when you click Disconnect.
- Nothing is written to disk. Nothing is sent to your browser except the
  connection info (username, org name, sandbox flag) after a successful login.
- If you deploy on Railway, remember the process may be restarted - you will
  need to re-enter credentials after redeploy.
- For production use behind an OAuth flow instead, replace `setConnection` in
  `lib/salesforceClient.ts` with a `jsforce.OAuth2` refresh-token exchange.
