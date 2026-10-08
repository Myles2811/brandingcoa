# Engineering Structure And Maintainability Standard

## Purpose

This standard defines how frontend code must be structured so Rebate Intelligence remains understandable, testable, and inexpensive to maintain. It applies to all production changes in this repository.

## Ownership And Dependency Direction

Keep responsibilities within these boundaries:

| Area | Responsibility |
| --- | --- |
| `src/app/(auth)` | Public authentication pages |
| `src/app/(platform)` | Protected, URL-addressable product screens and shared platform layout |
| `src/app/api` | Thin same-origin route handlers that proxy Laravel contracts |
| `src/app/actions` | Server actions for frontend-triggered Laravel mutations |
| `src/components/auth` | Client authentication lifecycle and protected-route presentation |
| `src/components/reconciliation` | Reconciliation UI, view state, formatting, and presentation models |
| `src/lib/auth` | Token acquisition, backend-user validation, and authenticated fetch behaviour |
| `src/lib/laravelApi.ts` | Server-only Laravel URL construction, headers, envelope handling, and proxying |
| `src/types` | Cross-feature frontend types |

Dependencies should flow from pages into feature components and from feature components into focused helpers. Contract and authentication helpers must not import UI components.

The frontend does not own workflow execution or persistence. Do not reintroduce local database access, workbook processing, source scraping, agent graphs, or direct workflow-service calls.

## Routing Structure

- A product screen that users may refresh, bookmark, share, or revisit through browser history must have a real App Router route.
- Route groups organise ownership without changing public URLs.
- Shared authenticated chrome belongs in `src/app/(platform)/layout.tsx` and its shell components.
- Page files should compose screens and resolve route inputs; they should not contain large client implementations.
- Use dynamic segments for durable resource identities and search parameters for filters, report runs, dates, and contextual overlays.
- Parse and validate route inputs at the boundary. Unknown enum values must fall back safely or produce an intentional not-found/error state.
- Do not duplicate pathname-derived state in React state.

## Integration Boundaries

- Browser code must use same-origin `/api/*` routes for Laravel-backed operations.
- Client requests requiring access tokens must use `authenticatedFetch`.
- Route handlers should remain thin and delegate shared proxy behaviour to `proxyLaravelRoute`.
- Server actions should use `laravelJson` rather than rebuilding URL, header, and envelope logic.
- Preserve query strings when the Laravel endpoint supports them.
- Keep binary downloads unwrapped and preserve relevant response headers.
- External field names may remain snake_case at the contract boundary; map them only when a stable frontend model benefits from it.
- Never place server tokens, API keys, or backend origins in client bundles.

## Simple Code Standard

- Prefer direct data flow and named functions over abstraction layers that conceal behaviour.
- Keep functions focused. Extract code when doing so clarifies a decision, removes meaningful duplication, or enables focused testing.
- Prefer early returns over deeply nested conditionals.
- Prefer readable intermediate values over dense expressions and nested ternaries.
- Avoid effects for values that can be derived during render.
- Keep effects limited to synchronising with external systems, subscriptions, and requests.
- Cancel obsolete requests when route or filter changes can race.
- Use structured parsing for structured data; do not infer typed state through fragile string matching.
- Centralise business mappings used by more than one component, such as review statuses, opportunity classifications, and money/date formatting.
- Do not add a generic abstraction for a single simple use case.

## Naming Conventions

Follow the repository's established conventions:

- Use PascalCase filenames for React components: `CaseDrawer.tsx`, `OpportunitiesScreen.tsx`.
- Use camelCase filenames for focused utilities and models: `format.ts`, `opportunityModel.ts`.
- Follow required Next.js filenames exactly: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, and `error.tsx`.
- Use PascalCase for components, interfaces, type aliases, and classes.
- Use camelCase for functions, variables, parameters, and runtime exports.
- Use `handle<Event>` for handlers owned by a component and `on<Event>` for callback props.
- Use `is`, `has`, `can`, or `should` for boolean values and predicates.
- Use `Id` and `Ids` suffixes for identifiers unless preserving an external contract field.
- Prefer precise domain terms already used by Laravel: `finding`, `opportunity`, `review`, `run`, `buyer`, `supplier`, and `framework`.
- Avoid vague catch-all modules such as `helpers.ts`, `utils.ts`, or `common.ts`.

## State Ownership

- Server/backend state remains authoritative after refresh.
- Shared dashboard state belongs in the reconciliation data provider.
- Route state belongs in the pathname or search parameters when it must survive refresh or be shareable.
- Temporary control state belongs in the smallest component that owns the interaction.
- Do not keep two writable sources for the same state.
- Optimistic updates must define rollback and error behaviour; otherwise wait for backend confirmation.
- Derived totals and classifications must be calculated from one canonical findings collection and shared domain functions.

## Component Boundaries

Split a component when it owns an independent interaction, a coherent named section, repeated behaviour, or a distinct state transition. Do not split solely to reduce line count.

Avoid components that combine all of the following:

- application navigation;
- data acquisition;
- filter serialisation;
- business calculations;
- a large presentation tree;
- mutation workflows.

Prefer page/screen, provider/controller, and presentational boundaries when those concerns genuinely differ.

## Error And Concurrency Discipline

- Treat aborted requests differently from failed requests.
- Prevent stale responses from replacing data for a newer route or filter.
- Surface upstream failures through the existing data-state patterns.
- Preserve useful backend error messages without exposing secrets or raw stack traces.
- Prevent duplicate submissions while a mutation is pending.
- A failed review update must not appear persisted.

## Change Discipline

- Keep changes scoped to requested behaviour.
- Do not reformat or refactor unrelated files.
- Preserve unrelated uncommitted changes.
- Do not alter API contracts as an incidental part of a UI refactor.
- Update standards, tests, and operational documentation when a shared convention or contract changes.
- Record assumptions when the repository does not provide enough evidence.

## Verification Discipline

Use verification proportional to risk:

- Focused component or helper tests for business mappings and query parsing.
- Route-level checks for redirects, direct loads, query parameters, and authentication return paths.
- Request checks for methods, paths, headers, bodies, envelope handling, and downloads.
- Responsive and keyboard checks for changed UI.
- `npm run lint` for every production change.
- `npm run build` for routing, shared state, authentication, configuration, or integration changes.

A change is not complete when only its happy path has been considered.
