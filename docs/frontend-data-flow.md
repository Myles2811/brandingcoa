# Frontend Data Flow

The current frontend is a clean reconciliation dashboard on the main `/` route. The old scanner-style panels have been removed from the active UI.

## Pages and Routes

| Route | Type | What it does |
| --- | --- | --- |
| `/` | Page | Loads dashboard data server-side and renders `DashboardShell`. |
| `/api/reconciliation/dashboard` | API | Returns latest or month-specific reconciliation findings for dashboard cards and opportunity filters. |
| `/api/reconciliation/report` | API | Exports dashboard data as PDF or Excel. |
| `/api/reconciliation/opportunity-review` | API | Saves opportunity status changes and notes from the drawer. |
| `/api/reconciliation/findings` | API | Returns paged reconciliation findings. |
| `/api/reconciliation/monthly-summary` | API | Returns month-level summary counts, values, issue categories, confidence counts, and finding codes. |
| `/api/reconciliation/run` | API | Runs the reconciliation pipeline against stored awards and workbook inputs. |
| `/api/reconciliation/sync` | API | Validates and previews workbook ingestion. |
| `/api/search` | API | Runs the public award scanner and saves qualified award notices. |
| `/api/history` | API | Reads stored awards by month. Kept for backend/history access even though the old frontend panel was removed. |
| `/api/schedule` and `/api/schedule/[id]` | API | Manages scheduled scanner jobs. |

## Main Components

| Component | Role |
| --- | --- |
| `DashboardShell` | Main app shell, sidebar/mobile header, view switching, refresh, month loading, and case drawer state. |
| `KpiRow` | Four headline metrics for loaded findings. |
| `MonthlyExposureCard` | Retrospective month selector and monthly exposure breakdown. |
| `ReportsTab` | Analytics rollups, report filters, drill-down links, and PDF/Excel export controls. |
| `PipelineTab` | Opportunities page: filters, new-opportunity spotlight, opportunity cards, and sorting. |
| `CaseDrawer` | Evidence review drawer with status updates and notes. |
| `SettingsTab` | Static settings/access/rules reference screen. |
| `Badges`, `DataState`, `format`, `opportunityModel`, `types` | Shared presentation, loading/error states, formatting, issue classification, and frontend types. |

## Analytics View

`src/app/page.tsx` loads the initial dataset with:

- `resolveReconciliationRun()` to pick a requested run or the latest completed/incomplete run with findings.
- `readLatestReconciliationFindingsForMonth()` when no run ID is supplied, using the previous complete month.
- `readReconciliationFindings()` when a specific `run_id` is supplied.

The main Analytics page renders:

- `KpiRow` from loaded findings.
- `MonthlyExposureCard`, which calls `/api/reconciliation/dashboard?year=YYYY&month=M` when the month changes.
- `ReportsTab`, which creates in-browser rollups from loaded findings and calls `/api/reconciliation/report` for exports.

Main database tables used:

- `reconciliation_runs` chooses the relevant run.
- `reconciliation_findings` supplies the evidence and calculated rebate fields.
- `contracts` supplies linked award details such as buyer, supplier, award value, publication date, source, and framework hints.
- `reconciliation_opportunity_reviews` and `reconciliation_opportunity_notes` supply workflow state and notes.

## Monthly Retrospective Card

The retrospective analytics card is `src/components/reconciliation/MonthlyExposureCard.tsx`.

It pulls data from:

- `GET /api/reconciliation/dashboard?year=YYYY&month=M`

That route calls:

- `readLatestReconciliationFindingsForMonth(year, month)`

That query:

- Filters `contracts` by `search_year` and `search_month`.
- Joins each contract to `reconciliation_findings` via `reconciliation_findings.external_award_ids`.
- Picks the latest finding per `candidate_id`.
- Adds workflow status from `reconciliation_opportunity_reviews`.
- Adds notes from `reconciliation_opportunity_notes`.

## Opportunities View

The Opportunities page is `PipelineTab`.

It starts with the same initial findings as Analytics. If the user selects a month, `DashboardShell` fetches:

- `GET /api/reconciliation/dashboard?year=YYYY&month=M`

The opportunity cards are not stored as a separate table. They are built from:

- `reconciliation_findings` as the main evidence/result table.
- `contracts` for linked public award details.
- `reconciliation_opportunity_reviews` for status.
- `reconciliation_opportunity_notes` for notes.

When a user updates a case in `CaseDrawer`, the frontend posts to:

- `POST /api/reconciliation/opportunity-review`

That writes:

- `reconciliation_opportunity_reviews` for status and due-now rebate.
- `reconciliation_opportunity_notes` for note history.

## Scanner and Scheduling

Manual scanning uses:

- `POST /api/search`
- `src/lib/graph`
- `src/lib/graph/nodes/persistResults.ts`

Stored outputs:

- Qualified awards go into `contracts`.
- Run telemetry goes into `ps_search_runs`.

Scheduled scanning uses:

- `src/lib/cron.ts`
- `src/lib/schedulerStore.ts`
- `schedules`

The scheduler runs at the top of every hour while the server is running. It loads active `schedules`, invokes the scanner graph, and updates `last_run_at`, `last_run_found`, and `total_found` after completed runs.

## Future Integration Hooks

| Need | Where to add it |
| --- | --- |
| Live Excel spreadsheet source | Extend the Microsoft Graph workbook path in `src/lib/reconciliation/graph/driveItems.ts` and `src/lib/reconciliation/graph/workbookDownloader.ts`. Parsed data should continue through the workbook parsers and into `reconciliation_run_sources`. |
| Different COA API | Add a client under `src/lib/reconciliation/` and wire it into `src/lib/reconciliation/graph/nodes/buyerEvidence.ts`. Store the result in `reconciliation_findings.buyer_evidence`. |
| Spend reports in another database | Add a spend-report client under `src/lib/reconciliation/` and wire it into `src/lib/reconciliation/graph/nodes/supplierEvidence.ts`. Store normalized evidence in `reconciliation_findings.supplier_evidence`; keep raw source snapshots in `reconciliation_run_sources` unless dedicated spend tables are introduced. |
| Scheduled CDP/scanner process | Keep schedule definitions in `schedules`, orchestration in `src/lib/cron.ts`, and scanner execution in `src/app/api/search/route.ts` plus the scanner graph. |
