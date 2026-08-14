# Rebate Intelligence Frontend

Next.js frontend for the Procurement Services Stage One rebate intelligence dashboard.

This repository now owns:

- React dashboard UI and server actions.
- Next.js API proxy routes under `/api/*`.
- Frontend presentation helpers and types.

It no longer owns workflow execution or application persistence. The Laravel `csg-api` is the API/data boundary, and the extracted Python workflow service owns scanner/reconciliation execution.

```text
Browser
  -> Next.js frontend and /api proxy routes
  -> Laravel csg-api
  -> Python workflow service, external sources, LLMs, SharePoint
```

## Runtime configuration

Create `.env.local` with:

```text
CSG_API_BASE_URL=http://localhost:8000
CSG_API_STAGE_ONE_PREFIX=/api/v1/procurement-services/stage-one

# Use one or both, depending on the Laravel auth middleware.
CSG_API_TOKEN=
CSG_API_KEY=

# Optional: pins the dashboard to a specific reconciliation run.
RECONCILIATION_DASHBOARD_RUN_ID=
```

`CSG_API_STAGE_ONE_PREFIX` is optional and defaults to `/api/v1/procurement-services/stage-one`.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The frontend requires a reachable Laravel API. If `CSG_API_BASE_URL` is missing, the dashboard and proxy routes return a configuration error instead of falling back to local database/workflow code.

## Proxy routes

The Next routes preserve the existing frontend-facing paths and forward to Laravel:

| Next route | Laravel path under the stage-one prefix |
| --- | --- |
| `GET /api/history` | `GET /history` |
| `DELETE /api/history?id=...` | `DELETE /history?id=...` |
| `POST /api/search` | `POST /search` |
| `GET /api/schedule` | `GET /schedule` |
| `POST /api/schedule` | `POST /schedule` |
| `PATCH /api/schedule/{id}` | `PATCH /schedule/{id}` |
| `DELETE /api/schedule/{id}` | `DELETE /schedule/{id}` |
| `POST /api/reconciliation/sync` | `POST /reconciliation/sync` |
| `POST /api/reconciliation/run` | `POST /reconciliation/run` |
| `GET /api/reconciliation/dashboard` | `GET /reconciliation/dashboard` |
| `GET /api/reconciliation/findings` | `GET /reconciliation/findings` |
| `GET /api/reconciliation/monthly-summary` | `GET /reconciliation/monthly-summary` |
| `POST /api/reconciliation/opportunity-review` | `POST /reconciliation/opportunity-review` |
| `GET /api/reconciliation/report` | `GET /reconciliation/report` |

JSON responses using Laravel’s standard `{ success, message, data }` envelope are unwrapped to `data` for existing frontend consumers. Report downloads are streamed without unwrapping so Laravel can return PDF/XLSX content directly.

## Repository notes

Legacy TypeScript workflow and persistence modules remain in `src/lib` and `scripts` as migration reference material. Active application routes should not import them. New work should target:

- `src/components/reconciliation/*` for UI.
- `src/app/actions/operations.ts` for frontend-triggered mutations.
- `src/app/api/**/route.ts` for proxy route changes.
- `src/lib/laravelApi.ts` for shared Laravel API/proxy behavior.
