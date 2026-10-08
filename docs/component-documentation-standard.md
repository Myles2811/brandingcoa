# Component Documentation Standard

## Purpose

Documentation must let another developer understand a component's responsibility, inputs, important decisions, external effects, and testing expectations without reverse-engineering the entire reconciliation flow. Comments must explain contracts and reasons rather than repeat syntax.

## What Must Be Documented

Add concise TSDoc to:

- exported feature components whose responsibility is not fully obvious from the name;
- providers and hooks that own shared state, requests, persistence, or navigation synchronisation;
- exported mapping, parsing, validation, and business-rule functions;
- proxy helpers and authentication services with security or compatibility constraints;
- props whose units, formats, lifecycle, or backend meaning are not evident from the type;
- non-obvious accessibility, responsive, caching, or concurrency decisions;
- workarounds required by Next.js, MSAL, Laravel envelopes, downloads, or browser behaviour.

Self-explanatory local presentation helpers do not need ceremonial comments.

## Component Comment Shape

Place a short comment immediately above the exported component or hook:

```ts
/**
 * Presents the URL-backed opportunity queue and loads month-scoped findings.
 * Laravel-confirmed review data remains authoritative after refresh.
 */
export default function OpportunitiesScreen(...) {
```

Include only caller-relevant details:

- product responsibility;
- important input assumptions;
- persisted or external effects;
- route or query-parameter behaviour;
- meaningful accessibility or responsive behaviour;
- a compatibility constraint that must survive refactoring.

## Providers And Hooks

State-owning providers must document:

- the state they own;
- how and when it is loaded or refreshed;
- whether state is backend-confirmed, derived, optimistic, or temporary;
- how stale or aborted requests are handled;
- which route inputs affect the request.

Hooks that perform mutations must state whether they prevent duplicate submission and how failures are surfaced.

## Boundary Functions

Functions at these boundaries require their non-obvious contract to be clear:

- search-parameter parsing and serialisation;
- frontend-to-Laravel field mapping;
- Laravel response-envelope handling;
- authentication header construction;
- opportunity classification and rebate calculations;
- report URL construction;
- date, currency, and identifier normalisation.

Example:

```ts
/** Preserves binary report bodies while forwarding Laravel download headers unchanged. */
export async function proxyLaravelRoute(...) {
```

## Props And Types

- Prefer descriptive names and narrow types before adding prose.
- Document ISO date expectations, currency units, percentages, identifiers, and nullable backend fields where ambiguity exists.
- Document callback timing and side effects when misuse could cause stale state or duplicate requests.
- Preserve exact backend field names at explicit contract boundaries.
- Do not comment every property when its name and type are sufficient.

## Inline Comments

Use inline comments sparingly for:

- why a surprising branch is correct;
- why a hook dependency is intentionally present or absent;
- why a focus, overflow, or responsive technique is required;
- why a response must remain unwrapped;
- the source of a business or compatibility rule.

Do not narrate implementation steps such as setting state or iterating a collection. Simplify complex code before adding explanatory prose.

## File-Level Documentation

A file-level comment is useful when a file coordinates a protocol boundary, authentication lifecycle, or multi-step workflow. Ordinary component files do not require banners.

Broad architectural and operational decisions belong in `docs/`. Local comments should remain close to the code they constrain.

## Accuracy

- Update comments in the same change as behaviour.
- Remove obsolete comments immediately.
- Do not claim data is persisted, authorized, accessible, or tested unless the implementation supports that claim.
- Do not duplicate long API schemas in comments; reference the owning contract documentation.
- Comments must not expose secrets, tokens, tenant details, or private production identifiers.

## Review Checklist

Before completion, confirm:

- A new developer can identify the component's responsibility and state owner.
- Query parameters and route effects are clear where relevant.
- External requests and persistence boundaries are understandable.
- Non-obvious calculations and mappings state their contract.
- Accessibility and responsive constraints are documented when implementation alone is insufficient.
- Comments explain reasons and constraints, not syntax.
- No stale or contradictory documentation remains.
