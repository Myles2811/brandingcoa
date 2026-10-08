# Component Sizing And Density Standard

## Intent

Rebate Intelligence uses compact enterprise density. At `1280x800` and Chrome 100% zoom, users should be able to compare exposure, scan opportunities, and reach core filters without excessive scrolling. Compact means restrained spacing and control geometry, not unreadably small text.

## Measurement Conditions

Report dimensions in CSS pixels under these conditions:

- Current Chrome at 100% browser zoom
- Primary desktop viewport: `1280x800`
- Comparison desktop viewport: `1440x900`
- Tablet viewports: `768` and `1024` wide
- Mobile viewports: `320`, `375`, and `430` wide

Record non-default OS display scaling when it affects visual evidence. Do not compensate for browser zoom by globally shrinking the application.

## Desktop Scale

| Element | Standard desktop size |
| --- | --- |
| Root/body text | Normally `12-14px` in dense operational surfaces |
| Page title | Normally `18-20px` |
| Section title | Normally `14-18px`, matched to section density |
| Normal action label | `12-13px`, semibold |
| Standard button | `32-36px` high |
| Compact icon action | `28px` square in dense tables; `32px` square elsewhere |
| Standard input/select | `36px` high |
| Table header | `11-12px`, restrained uppercase metadata treatment |
| Table row | Normally `40-48px`, depending on secondary evidence |
| Panel padding | Normally `12-16px` |
| Control radius | Normally `6-8px` |
| Repeated item/card radius | Normally `8px`; existing dashboard modules may use up to `12px` consistently |
| Related-control gap | Normally `4-8px` |
| Distinct-group gap | Normally `12-16px` |

Use larger controls only for touch layouts or a genuinely prominent isolated action.

## Dashboard Density

- KPI cards should expose their label, primary value, and short context without oversized padding.
- Financial values must remain visually scannable and stable while loading.
- Status breakdowns should favour compact rows or grid cells over tall decorative cards.
- Keep the first operational section and core controls visible at `1280x800` where content permits.
- Avoid repeated section introductions when the route header already establishes context.

## Filters And Forms

- Desktop filters should be compact and wrap into logical rows.
- Search fields may be wider than categorical selects but must not force sibling controls off-screen.
- Inputs are full-width when stacked on mobile.
- Date fields, selects, and action buttons in the same group should share a consistent height.
- Long option labels must not widen the page; constrain the control and allow the native menu to show the value.
- Validation messages must not overlap or resize adjacent controls unpredictably.

## Tables And Repeated Results

- Wrap wide tables in `overflow-x-auto` and keep overflow inside the section.
- Dense table actions are approximately `28px` square with a `4px` gap.
- Keep action columns only as wide as their controls require.
- Opportunity cards should use stable grid tracks at desktop widths and reflow to a single readable column on mobile.
- Badges and long names must not increase every row unnecessarily; wrap or truncate only when full content remains accessible.

## Touch And Mobile

Below `768px`, touch targets should normally be at least `44px` on coarse pointers. Reflow the layout to make room rather than enlarging controls into neighbouring content.

- KPI cards may use one or two columns only when the longest supported label and value fit.
- Navigation must remain horizontally contained and readable.
- Action groups may move to a separate row.
- Avoid fixed widths for buyer, supplier, framework, and report controls.
- Drawers should use the available viewport width and safe internal padding.

## Stable Geometry

- Loading labels, values, icons, and error messages must not produce avoidable layout shift.
- Buttons retain a stable minimum width while loading.
- Charts, segmented bars, counters, and tiles require explicit responsive constraints.
- Use `min-w-0` on flexible grid and flex children.
- Use `minmax(0, 1fr)` semantics for tracks containing user or backend data.
- Do not use viewport-scaled font sizes.

## Shared Styling Rule

Start repeated sizing and visual changes in the most appropriate shared surface:

- `src/app/globals.css`
- `src/styles/theme.css`
- `src/components/reconciliation/Badges.tsx`
- `src/components/reconciliation/DataState.tsx`
- shared layout or shell components

Local classes are appropriate for genuinely unique layout. Repeated local geometry is evidence that a shared variant or token should be introduced.

## Acceptance Checks

At `1280x800` and 100% zoom:

- Page actions do not dominate the route header.
- Inputs and buttons have consistent geometry.
- KPI and workflow sections remain compact and scannable.
- The page does not require horizontal scrolling.
- Long realistic buyer, supplier, and framework names do not overlap adjacent content.

At mobile widths:

- Controls remain touch-safe.
- Navigation, filters, KPI cards, opportunity cards, and drawers reflow cleanly.
- Text does not clip or overlap.
- Wide tables scroll internally.
