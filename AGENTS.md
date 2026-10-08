# AGENTS.md

## Project context

This repository is the Rebate Intelligence frontend for Procurement Services. It supports award-to-rebate reconciliation, exposure analysis, evidence review, operational follow-up, reporting, and access management.

The application must feel calm, trustworthy, compact, and suitable for repeated professional use with public-sector procurement and finance data.

## Technology

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Microsoft Entra ID authentication through MSAL
- Laravel API as the application and persistence boundary
- A separate Python workflow service, invoked through Laravel

## System boundaries

- The browser calls same-origin Next.js endpoints under `/api/*` using `authenticatedFetch` when bearer authentication is required.
- Next.js route handlers proxy requests to Laravel through `src/lib/laravelApi.ts`.
- Server actions may call Laravel through `laravelJson`.
- Laravel owns persisted application data, authorization decisions, report generation, and workflow dispatch.
- The frontend must not call databases, SharePoint, Microsoft Graph, LLM providers, or the Python workflow service directly.
- Do not change Laravel paths, methods, headers, payloads, envelope handling, or report streaming without an explicit contract change.

## Core rules

- Preserve existing behaviour and API compatibility.
- Keep production changes focused and maintainable.
- Reuse established components, models, formatting functions, and proxy helpers before adding new abstractions.
- Keep URL-addressable screens in `src/app/(platform)` and public authentication screens in `src/app/(auth)`.
- Keep shared authenticated chrome and route guarding in the platform layout rather than duplicating it in pages.
- Treat URL query parameters as part of the navigation contract when they represent shareable state such as `run_id`, filters, dates, or an open opportunity case.
- Never silently replace backend-confirmed state with frontend-only state for operational workflows.
- Do not remove or rewrite unrelated worktree changes.

## Mandatory standards

Read and follow the standards relevant to the task before changing application code:

- `docs/engineering-structure-and-maintainability-standards.md`
- `docs/ui-ux-design-and-flow-quality-standard.md`
- `docs/component-sizing-and-density-standard.md`
- `docs/component-documentation-standard.md`

These are implementation requirements. When rules conflict, preserve product correctness, security, accessibility, and backend contract compatibility first, followed by the most specific applicable standard.

## Routing and authentication

- `/` redirects to the default authenticated screen.
- `(auth)` routes must remain accessible before authentication.
- `(platform)` routes must be protected by the shared authentication boundary.
- Use `next/link` for normal navigation and `useRouter` only for imperative transitions.
- Active navigation state must be derived from the pathname, not maintained as duplicate component state.
- Direct loading, refresh, Back/Forward, and login return paths must work for every platform screen.
- Validate query parameters before using them as typed filters or identifiers.

## API integration

- Browser components call Next.js `/api/*` routes; do not expose the Laravel origin or server credentials to the browser.
- Forward authentication and business-context headers through the established helpers.
- Preserve Laravel JSON-envelope unwrapping and binary report responses.
- Use `cache: "no-store"` for operational data unless a reviewed caching policy says otherwise.
- Account for loading, empty, partial, unauthorized, validation-error, and upstream-failure states.
- Abort obsolete browser requests where rapid navigation or filter changes could create stale results.

## Responsive UI requirements

Check affected screens at `320`, `375`, `430`, `768`, `1024`, `1280`, and `1440+` CSS pixels.

- No page-level horizontal scrolling.
- No clipped or overlapping text, controls, badges, menus, or drawers.
- Navigation and header actions must remain usable at every supported width.
- Forms stack cleanly on mobile.
- Tables scroll within a bounded container instead of widening the page.
- Drawers and dialogs fit the viewport, scroll internally, and keep actions reachable.

## Verification

Before completing a code change:

- Run `npm run lint`.
- Run `npm run build` for routing, configuration, shared-component, or integration changes.
- Exercise affected routes directly, including meaningful query parameters.
- Verify network paths and payloads when API-facing behaviour changes.
- Inspect materially changed UI at desktop and mobile widths.
- State any checks that could not be completed because live services or representative data were unavailable.

<!-- BEGIN:nextjs-agent-rules -->

# Next.js version awareness

This repository uses Next.js 16. APIs and conventions may differ from earlier versions. Before changing framework-sensitive behaviour, inspect the installed Next.js package documentation or implementation and heed current deprecations.

<!-- END:nextjs-agent-rules -->
