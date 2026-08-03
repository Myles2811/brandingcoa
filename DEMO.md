# liveDemoTue — static demo build

This branch turns the Rebate Intelligence dashboard into a **fully static site** with the
live database values baked in, so it can be demoed locally and deployed to Azure Static
Web Apps with no backend, no database and no environment variables.

## What changed

| Area | Live branch | This branch |
| --- | --- | --- |
| Data source | Postgres (`DATABASE_URL`) | `src/lib/demo/snapshot.json`, captured from the live DB |
| Page render | `force-dynamic` server component | `force-static`, prerendered at build |
| Month switching | `GET /api/reconciliation/dashboard` | `demoDataForMonth()` reads the snapshot |
| `?run_id=` deep links | server-side search params | resolved client-side from the snapshot |
| Review outcomes (status, due-now, notes) | `updateOpportunityReviewAction` → Postgres | simulated in session state (`src/lib/demo/demoReviews.ts`) |
| Report PDF / Excel | `GET /api/reconciliation/report` | generated in the browser (`src/lib/reconciliation/reportBuilder.ts`) |
| API routes / server actions | `src/app/api`, `src/app/actions` | removed (static export forbids them) |

The reconciliation pipeline libraries (`src/lib/reconciliation/**`, `src/lib/graph/**`,
SharePoint and Anthropic clients) are left in place but are no longer imported by any
page, so none of their environment variables are read. `next build` succeeds with **no
`.env.local` present at all** — verified.

## Run locally

```bash
npm run dev     # http://localhost:3000
npm run build   # emits a static site in ./out
```

## Deploy to Azure Static Web Apps

Build output is `out/`. `staticwebapp.config.json` handles the SPA fallback.

```
app_location:    ps-awards-scanner
output_location: out
api_location:    (leave empty — there is no API)
```

## Refresh the snapshot

Needs `DATABASE_URL` in `.env.local` and network access to the Azure Postgres server:

```bash
npm run snapshot:demo
```

The snapshot contains every reconciliation run and every month that has findings, so the
month picker and run deep links all work. Captured contents at time of writing:

- 16 runs (largest: `f1bb607f…`, 188 findings)
- 6 months of findings — Feb 2026 (20), Mar 2026 (18), Apr 2026 (2), May 2026 (6), Jun 2026 (35), Jul 2026 (3)
- Default landing month: **June 2026**

## Demo caveats

- Review saves, notes and the Settings user invitations live in memory only — a page
  reload resets them.
- "Refresh data" pulses the control but re-reads the same snapshot; there is nothing
  behind it to poll.
