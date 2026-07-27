# Database Usage

This app creates 9 application-managed PostgreSQL tables. Current runtime code actively reads or writes 8 of them; `reconciliation_entity_embeddings` is provisioned for entity-resolution storage but is not referenced by runtime code in this checkout.

## Summary

| Table | Used by | Purpose |
| --- | --- | --- |
| `contracts` | Scanner, history APIs, reconciliation dashboard/run APIs | Stores persisted external award notices found by the PS awards scanner. Reconciliation joins findings back to these rows through `candidate_id`. |
| `schedules` | Scheduler API and hourly cron | Stores saved award-search schedules, active/inactive state, last run time, and cumulative found counts. |
| `ps_search_runs` | Award scanner graph | Records each scanner run, counts, source completion status, model, token usage, and issues. |
| `reconciliation_runs` | Sync/run APIs and dashboard | Stores reconciliation operation lifecycle, source workbook snapshots, input counts, finding counts, completion status, issues, and errors. |
| `reconciliation_findings` | Reconciliation graph and dashboard/report APIs | Stores one persisted reconciliation finding per run and award, including evidence JSON, calculated exposure, confidence, review flags, and display names. |
| `reconciliation_entity_embeddings` | Setup/migration only in this checkout | Stores canonical buyer/supplier embeddings for deterministic entity resolution. It is created by setup/migration scripts, but no current runtime file references it directly. |
| `reconciliation_run_sources` | Reconciliation run and evidence persistence | Stores parsed workbook source data for a run, so graph nodes can link findings back to framework rules, rebate checks, and invoice spend rows. |
| `reconciliation_opportunity_reviews` | Dashboard case workflow | Stores the user-facing opportunity status, due-now rebate override, updater, and timestamps. |
| `reconciliation_opportunity_notes` | Dashboard case workflow | Stores notes attached to an opportunity review. |

## Runtime Flow

1. Award scanning writes external award notices into `contracts` and run telemetry into `ps_search_runs`.
2. Saved scheduler jobs live in `schedules`; the cron reads active jobs and updates the last-run counters.
3. Reconciliation sync/run creates a row in `reconciliation_runs`.
4. Reconciliation run saves parsed workbook records to `reconciliation_run_sources`.
5. The evidence graph writes final outputs to `reconciliation_findings`.
6. Dashboard reads `reconciliation_runs`, `reconciliation_findings`, `contracts`, `reconciliation_opportunity_reviews`, and `reconciliation_opportunity_notes`.
7. User status changes in the drawer upsert `reconciliation_opportunity_reviews`; optional notes insert into `reconciliation_opportunity_notes`.

## Frontend Data Sources

| Frontend area | API/source | Main tables |
| --- | --- | --- |
| Main Analytics view | Server load in `src/app/page.tsx`, through `resolveReconciliationRun()` and `readLatestReconciliationFindingsForMonth()` | `reconciliation_runs`, `reconciliation_findings`, `contracts`, `reconciliation_opportunity_reviews`, `reconciliation_opportunity_notes` |
| Monthly rebate exposure retrospective card | `GET /api/reconciliation/dashboard?year=YYYY&month=M` | `reconciliation_findings` joined to `contracts` by `candidate_id`; opportunity status comes from `reconciliation_opportunity_reviews` and notes from `reconciliation_opportunity_notes` |
| Report builder | In-page rollups from loaded findings; exports call `GET /api/reconciliation/report` | Same as Analytics: `reconciliation_runs`, `reconciliation_findings`, `contracts`, opportunity review tables |
| Opportunities page | Initial data from server load; month filter calls `GET /api/reconciliation/dashboard?year=YYYY&month=M` | `reconciliation_findings` joined to `contracts`; workflow state in `reconciliation_opportunity_reviews` and notes in `reconciliation_opportunity_notes` |
| Opportunity drawer status and notes | `POST /api/reconciliation/opportunity-review` | Writes `reconciliation_opportunity_reviews`; inserts notes into `reconciliation_opportunity_notes` |
| Reconciliation run button/API clients | `POST /api/reconciliation/run` | Creates/updates `reconciliation_runs`; writes `reconciliation_run_sources`; writes `reconciliation_findings`; reads `contracts` as external awards |
| Reconciliation sync/API clients | `POST /api/reconciliation/sync` | Creates/updates `reconciliation_runs`; validates live workbook inputs |
| Award scanning/API clients | `POST /api/search` | Writes `contracts`; writes `ps_search_runs` |
| Search scheduling/API clients | `/api/schedule` and `/api/schedule/[id]`; hourly cron in `src/lib/cron.ts` | Reads/writes `schedules`; scheduled scans write `contracts` and `ps_search_runs` |

## Future Integration Places

| Future item | Likely place to add it | Tables/API impact |
| --- | --- | --- |
| Live Excel spreadsheet source | `src/lib/reconciliation/graph/driveItems.ts`, `workbookDownloader.ts`, and the SharePoint/Graph environment variables | Keep writing parsed rows into `reconciliation_run_sources`; update snapshot IDs in `reconciliation_runs` |
| Separate COA API | Add a new client under `src/lib/reconciliation/` and wire it into buyer evidence nodes, especially `graph/nodes/buyerEvidence.ts` | Buyer evidence still lands in `reconciliation_findings.buyer_evidence`; consider adding source metadata to `evidence_source_references` |
| Separate spend-report database | Add a DB/client module under `src/lib/reconciliation/` and wire it into supplier evidence nodes, especially `graph/nodes/supplierEvidence.ts` | Supplier evidence still lands in `reconciliation_findings.supplier_evidence`; raw imported source rows can continue to be stored in `reconciliation_run_sources` or move to dedicated spend tables if needed |
| Scheduled CDP/scanner runs | `src/lib/cron.ts`, `src/lib/schedulerStore.ts`, `/api/schedule`, and `src/app/api/search/route.ts` | Schedules live in `schedules`; each completed scan writes awards to `contracts` and telemetry to `ps_search_runs` |

## Notes

- `reconciliation_opportunity_reviews` and `reconciliation_opportunity_notes` are created both by `scripts/setup-postgres.ts` and lazily by `ensureOpportunityReviewTables()` so the dashboard can self-heal in older environments.
- `checkpoints` may exist when LangGraph checkpoint persistence is enabled. It is referenced by `scripts/run-march-2026-crosscheck.ts` for audit counts, but it is not created in this app's setup script.
- Static JSON catalogue files under `data/` are not database tables; they provide the Procurement Services framework register used by scanner classification and dashboard framework confirmation.
