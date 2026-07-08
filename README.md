# Salesforce Data Cloud Suite v3.4

A Next.js 14 + TypeScript + Tailwind CSS application providing three Discovery-phase tools:

1. **Credit Consumption Analyser** - Every rate-sheet item as its own input, rate metric in every tooltip.
2. **Data Readiness Validator** - Now with **COUNT_DISTINCT** for accurate Salesforce duplicate rates at any scale.
3. **Documentation** - Full methodology reference, fully editable JSON content.

## What is new in v3.4

- **Accurate duplicate counts via COUNT_DISTINCT** - Salesforce now uses `SELECT COUNT_DISTINCT(field) FROM object WHERE field != null` to get an exact unique-value count regardless of table size. Previous versions were limited to the top 200 duplicate groups via GROUP BY, which under-reported duplicates on large datasets.
- **Documentation module** - `/documentation` route with full methodology; `/documentation/settings` provides a JSON editor to update content in-browser.
- **Ready for Railway deploy** - includes `Dockerfile`, `.dockerignore`, and `railway.json`; `next.config.mjs` sets `output: "standalone"` for lean container image.

## Local Quick Start

Prerequisites: Node.js 18.17+ and npm 9+.

```bash
unzip sf-datacloud-suite.zip
cd sf-datacloud-suite
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Railway

### Option A - Deploy from GitHub (recommended)

1. Push this project to a GitHub repository.
2. Sign in at https://railway.com and click **New Project -> Deploy from GitHub repo**.
3. Grant Railway access to the repo, then select it.
4. Railway auto-detects the `Dockerfile` and starts the build. No environment variables are required for the app to run; add any secrets later if you want to pre-seed credentials.
5. When the build completes, click **Settings -> Networking -> Generate Domain** to get a public HTTPS URL, or attach your own custom domain.

### Option B - Deploy via Railway CLI

```bash
npm i -g @railway/cli
railway login
railway init            # creates the project
railway up              # uploads and builds
railway open            # opens the deployed URL
```

### Option C - One-off via Docker locally

```bash
docker build -t sf-datacloud-suite .
docker run -p 3000:3000 sf-datacloud-suite
# open http://localhost:3000
```

## How the container works

- **Multi-stage build:** `node:20-alpine` builder installs deps and runs `npm run build`; runner stage copies only the standalone output + public + static assets.
- **Non-root user** `nextjs` (uid 1001) inside the container.
- **Standalone Next.js output** (`next.config.mjs -> output: "standalone"`) drops the container size to under 200 MB.
- **PORT** is honored - Railway sets `PORT` automatically; the container also defaults to 3000.

## Routes

- `/` - Landing with 3 tool cards
- `/credit-calculator` - Credit Consumption Analyser
- `/credit-calculator/settings` - UI-editable rate configuration
- `/data-readiness` - 6-step wizard (Select System -> Connection -> Objects -> Configure Rules -> Run -> Results)
- `/data-readiness/settings` - UI-editable readiness config
- `/documentation` - Methodology reference (with PDF export)
- `/documentation/settings` - JSON editor for docs content

## Backend API

- `POST /api/readiness/test-connection` - validate credentials
- `POST /api/readiness/metadata` - list objects/tables/lists
- `POST /api/readiness/fields` - list fields for one object
- `POST /api/readiness/duplicate-check` - run rules array

All routes run on the Node.js runtime and return live `logs` for the in-app Backend Console.

## System setup

- **Salesforce:** user with API access + security token. Login URL defaults to `https://login.salesforce.com`.
- **Zendesk:** API token from Admin Center -> Apps and integrations -> APIs.
- **SharePoint:** Azure AD app with `Sites.Read.All` Application permission; `siteId` format `host,GUID,GUID`.

## Security notes

- Credentials are POSTed to the Next.js server per request; nothing is persisted server-side.
- Saved Connections go to browser localStorage only.
- The Backend Console redacts `password` / `apiToken` / `clientSecret` / `securityToken` / `authorization` / `sessionId` before returning logs.

Schema v3.4.0 - Last updated 2026-07-07
