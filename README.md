# PS Awards Scanner and Rebate Reconciliation

Next.js application for scanning UK Procurement Services framework award notices and deterministically reconciling external awards, internal rebate records, supplier spend, and framework rules.

## Procurement Services catalogue

The live framework and supplier catalogue is stored in `data/procurement-services-catalogue.json`.
It retains expired framework IDs for historical award searches while lifecycle checks prevent expired or
coming-soon frameworks from being treated as current. Supplier membership and published lot assignments
are passed to classification as supporting evidence only; a separate Procurement Services signal is required.

Run a manual refresh with:

```bash
npm run refresh:frameworks
```

The refresh writes a machine-readable coverage report to
`data/procurement-services-catalogue-audit.json`. A GitHub Actions workflow runs this on the first day of
every month, tests and builds the application, and commits catalogue changes. The importer fails safely if
the official catalogue unexpectedly returns fewer than 45 frameworks and reports any active framework page
that does not publish supplier data.

## SharePoint reconciliation

The deterministic reconciliation layer downloads the rebate check log, supplier invoice spreadsheet, and
framework rules workbook from SharePoint with Microsoft Graph, then parses each worksheet's local used range.
It does not require Excel tables and does not use an LLM for matching or calculations.

Required environment variables:

```text
GRAPH_TENANT_ID
GRAPH_CLIENT_ID
GRAPH_CLIENT_SECRET
SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
REBATE_CHECK_LOG_ITEM_ID
INVOICE_SPREADSHEET_ITEM_ID
FRAMEWORK_RULES_ITEM_ID
```

For local testing, `GRAPH_BEARER_TOKEN` can replace the three app credential variables. Use
`POST /api/reconciliation/sync` to validate and preview workbook ingestion, and
`POST /api/reconciliation/run` to download the current workbooks and reconcile them against persisted
external awards. An optional run body may contain `as_of` and `external_award_ids`.

Both endpoints require `RECONCILIATION_API_KEY`. Supply it as `Authorization: Bearer <key>` or
`X-API-Key: <key>`. Authenticated sync and reconciliation calls are recorded in `reconciliation_runs`;
reconciliation results are stored in `reconciliation_findings` for audit history and the Cases UI.

The cross-check is a checkpointed LangGraph pipeline: embeddings-only entity resolution, framework-rate
lookup, parallel buyer/supplier evidence, evidence judging with targeted retries, confidence/finding,
strict output and persistence. Parsed workbook sources are stored once per run in
`reconciliation_run_sources`; PostgreSQL LangGraph checkpoints retain the accumulated per-award evidence
trail. `RECONCILIATION_ENTITY_THRESHOLD` defaults to `0.72`.

```bash
curl -X POST -H "Authorization: Bearer $RECONCILIATION_API_KEY" http://localhost:3000/api/reconciliation/sync
curl -X POST -H "Authorization: Bearer $RECONCILIATION_API_KEY" -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/reconciliation/run
```

Run `npm run test:sharepoint` to resolve and verify the SharePoint site, drive, item IDs and ETags without
downloading workbook content. Add `-- --download` to download and parse all three files and confirm the
PostgreSQL external-award count. Site and drive IDs are resolved automatically when their environment values
are left blank.

The target application must have Microsoft Graph `Sites.Selected` application permission with admin consent,
plus an explicit site role. A SharePoint Administrator (or Global Administrator) can grant the site role with a
short-lived delegated token containing `Sites.FullControl.All`:

```bash
GRAPH_ADMIN_BEARER_TOKEN='short-lived-admin-token' npm run grant:sharepoint
```

The provisioning script grants only `read` to the REBATES-TEST site and is idempotent. Never reuse the
reconciliation application's client secret as the administrator token.

For fully automated provisioning and verification, run:

```bash
npm run provision:sharepoint
```

This installs PowerShell when necessary, installs the Microsoft Graph PowerShell modules for the current user,
opens the required interactive Microsoft administrator sign-in, grants and verifies the site role, disconnects
the admin session, downloads and parses all workbooks, starts or reuses the local application, and validates the
sync and reconciliation endpoints. No administrator access token is copied into an environment file.

## Modules

- **PS Awards Scanner**: searches Find a Tender, Contracts Finder, Public Contracts Scotland, Sell2Wales and eTendersNI; classifies award notices with Anthropic; and stores persistent contract history with explicit completeness telemetry.
- **Rebate Reconciliation**: downloads three SharePoint workbooks through Microsoft Graph, parses XLSX worksheets locally, and applies deterministic matching and rebate calculations.
- **Scheduler**: runs saved PS award searches from the server runtime.

## Getting Started

### Azure model trial of the original branding pipeline

The retained scanner and reconciliation libraries support Azure OpenAI Responses function
calling when `AI_PROVIDER=azure_openai`. Award classification and buyer evidence use
`gpt-6.1-sol`; routine reconciliation steps use `gpt-6-luna`; the evidence judge uses
`gpt-6-astra`. The three `AZURE_OPENAI_*_MODEL` variables can select deployment names.
Existing Anthropic configuration remains available when `AI_PROVIDER=anthropic` or unset.
The static demo dashboard does not become a live backend by running this command.

Load your existing branding Graph environment and Azure resource environment locally, and
set `DATABASE_URL` explicitly to a separate trial PostgreSQL database. Initialize that
database with `scripts/setup-postgres.ts`. Never initialize a database without verifying its
target. The runner downloads current SharePoint workbook snapshots and applies the requested
publication month; a retrospective March run therefore does not recreate the workbooks as
they existed in March.

```bash
npx tsx --env-file=/path/to/branding.env --env-file=/path/to/azure.env \
  scripts/run-azure-month.ts --year 2026 --month 3 --budget-usd 15
```

Run `--fetch-only` to save the public-source fetch before paying for classification, then
use `--reuse-fetch` to classify that exact saved month and reconcile the resulting awards.
`--resume-reconciliation` uses the trial database's already persisted awards for that month.
The ignored `data/azure-<month>-<year>/` directory (for example,
`data/azure-march-2026/`) holds private source snapshots, findings, model
audit and a summary. The content-free model ledger retains observed tokens, failed paid
attempts and configured-rate estimates across resumes. Unknown billing outcomes stop the
trial and retain an explicitly labelled upper bound. A model spending cap is not an Azure
invoice reconciliation or a production multi-worker budget service.

Find a Tender, Public Contracts Scotland, Sell2Wales and Contracts Finder are requested;
the optional Northern Ireland scraper is excluded. Source failures and pagination caps
remain visible as incomplete coverage. Finishing the available cases does not establish
complete UK coverage. The command does not create or enable a schedule.

Run `npm run test:azure` for mocked provider, cost, error-accounting and schema regressions.

```bash
npm run dev
```

Open `http://localhost:3000`.

## Required Environment

Create `.env.local` with:

- `ANTHROPIC_API_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`
- `DATABASE_URL`
- the Microsoft Graph and SharePoint variables listed above

## Setup Scripts

Use `npm run setup-postgres` for a new PostgreSQL database. `npm run setup-dataset` creates the active scanner evaluation dataset. The one-way `npm run migrate:remove-legacy` migration removes retired tables from an existing database.

## Main Paths

- `/` - PS Awards Scanner
- `POST /api/reconciliation/sync` - validate live workbook ingestion
- `POST /api/reconciliation/run` - run deterministic reconciliation

## Notes

Local data, build output, dependencies, and secrets are ignored by Git.
