# UI/UX Design And Flow Quality Standard

## Product Character

Rebate Intelligence is an operational reconciliation application. Its interface must feel calm, compact, trustworthy, and designed for repeated professional review. Prioritise scanning, comparison, evidence, financial clarity, and confident follow-up over decorative presentation.

Exact control, spacing, typography, and density measurements are defined in `docs/component-sizing-and-density-standard.md`. Documentation expectations are defined in `docs/component-documentation-standard.md`.

## Visual Hierarchy

- Each route and review context must have a clear title, dominant information, and primary action.
- Emphasise due-now exposure, opportunity state, confidence, and required action through order and grouping, not colour alone.
- Use no more than one primary action within a decision context.
- Group related evidence through alignment, spacing, dividers, and full-width sections.
- Do not nest cards inside cards. Use rows, bands, headings, or dividers within a framed section.
- Avoid marketing layouts, oversized headings, decorative illustration, excessive empty space, and dramatic elevation.

## Reconciliation Semantics

- Clearly distinguish confirmed framework opportunities from unconfirmed or review-only findings.
- Keep `due now`, lifetime estimate, award value, and counts visibly distinct and consistently labelled.
- Review status, evidence verdict, confidence, and opportunity issue must not be conflated.
- Use the established semantic treatments consistently across analytics, opportunity cards, and the evidence drawer.
- Never present an estimate as recovered, invoiced, or secured money unless the backend status supports that claim.
- Show the applicable reporting period or date context near month-specific values.

## Affordances And Actions

- Interactive controls must look interactive before hover.
- Use links for navigation and buttons for commands.
- Selected, expanded, current, disabled, loading, and saved states require visible treatment.
- Button labels should describe outcomes: `Save review`, `Refresh data`, `Download report`.
- Consequential or ambiguous commands should use text or icon-and-text labels.
- Icon-only actions require an accessible name and tooltip.
- Disabled controls must remain legible; provide a reason when unavailability is not obvious.
- Destructive actions require explicit confirmation naming the affected record and consequence.

## Layout And Spacing

- Align page content and controls to a consistent grid.
- Use a small, repeatable set of spacing values.
- Use whitespace to communicate grouping without making operational screens sparse.
- Apply `min-w-0` to flexible children that may contain long supplier, buyer, or framework names.
- Let action groups and filters wrap intentionally.
- Fixed dimensions require a workflow reason and responsive constraints.
- Avoid page-level horizontal overflow.

## Typography

- Use sentence case for headings, labels, buttons, and messages unless displaying a source value.
- Keep page titles, section titles, field labels, body text, metadata, and monetary values visually distinct.
- Do not scale font size with viewport width.
- Letter spacing is `0` for normal text; restrained positive tracking may be used for small uppercase metadata.
- Do not shrink essential text to fit an overloaded layout.
- Truncation must not hide information required for a review decision. Provide the full value through wrapping, a detail view, or an accessible title where appropriate.

## Colour And Elevation

- Use semantic colour consistently: blue for navigation/information, green for successful or resolved states, amber for attention, red for errors, and neutrals for structure.
- Never rely on colour alone; pair it with text or another programmatic signifier.
- Maintain WCAG AA contrast for text, controls, focus indicators, and meaningful graphics.
- Use saturated colour for decisions and exceptions, not large decorative surfaces.
- Use shadows to communicate elevation or temporary layering, not decoration.
- Equivalent surfaces must use equivalent border and elevation treatments.

## Feedback And Data States

Every affected workflow must account for the states that apply:

- loading and refreshing;
- empty data;
- partial or unconfirmed evidence;
- validation failure;
- authentication or authorization failure;
- upstream API failure;
- mutation in progress;
- mutation success;
- mutation failure and retry;
- stale or superseded requests.

Feedback must appear near the content or action it describes and explain what happened and what the user can do next. A transient notification must not be the only record of a consequential failure.

## Filters, URLs, And Navigation

- Shareable filters belong in search parameters.
- Direct loading and refresh must recreate the represented view.
- Back and Forward must produce understandable state transitions.
- Search input updates must remain responsive and must not lose characters during navigation.
- Invalid query values must fail safely.
- Analytics drill-downs must open Opportunities with the intended filters visible and applied.
- Opening a case through `?case=` must preserve current filters, and closing it must return to the same filtered list.

## Evidence Drawers And Overlays

- Use a drawer for contextual evidence review that benefits from retaining the opportunity list underneath.
- Drawers must have an accessible name, intentional initial focus, keyboard operation, and a reliable close action.
- Close with `Escape` when it is safe to do so and restore focus to the invoking control.
- Prevent background interaction and scrolling for modal drawers.
- Do not discard unsaved notes or financial adjustments through an ambiguous outside click.
- Drawers must fit the viewport, scroll internally, and keep save/status controls reachable.
- Do not nest modal overlays.

## Responsive Behaviour

Check affected flows at `320`, `375`, `430`, `768`, `1024`, `1280`, and `1440+` CSS pixels.

- No page-level horizontal scrolling.
- No clipped or overlapping text, badges, fields, menus, or actions.
- Desktop navigation becomes compact mobile navigation without losing destinations.
- Header actions wrap or collapse predictably.
- KPI grids reflow without forcing minimum content width beyond the viewport.
- Filters stack or wrap while preserving labels and current values.
- Tables use an internal `overflow-x-auto` container and retain readable columns.
- Forms stack on mobile.
- Drawers and dialogs remain within the viewport with reachable actions.
- Dense desktop controls become touch-safe on coarse-pointer mobile layouts.

## Accessibility Baseline

- Prefer semantic HTML and native controls.
- All interactions must work by keyboard.
- Focus must be visible and follow a logical order.
- Controls require programmatic labels.
- Current navigation must expose `aria-current="page"`.
- Error and status messages should be associated with relevant content and announced when appropriate.
- Do not use placeholder text as the only label.
- Respect `prefers-reduced-motion`.
- Maintain WCAG AA contrast.

## Motion

- Use motion only to clarify state change, progress, or spatial relationship.
- Transitions must be subtle and must not delay work or move focus unexpectedly.
- Loading indicators must correspond to real work.
- Hover effects must not cause layout shift.
- Preserve the meaning of state changes when reduced motion is enabled.

## Flow Verification

Before completion, verify the applicable items:

1. Direct route load, refresh, Back, Forward, and login return.
2. Happy path with production-shaped data.
3. Loading, empty, partial, unauthorized, and API-failure states.
4. Filter application, reset, and analytics drill-down.
5. Case open, close, save, validation failure, and retry.
6. Report filters and PDF/Excel download paths.
7. Keyboard navigation, visible focus, labels, and drawer behaviour.
8. Desktop at `1280x800` and `1440x900` at Chrome 100% zoom.
9. Mobile and tablet widths listed above.
10. Lint, production build, and relevant automated tests.

The handoff must state what was checked and identify live-data or integration scenarios that still require manual review.
