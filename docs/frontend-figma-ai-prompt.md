# Figma AI Prompt: Rebate Intelligence Front-End Recreation

Use this prompt to recreate the current front-end of the `ps-awards-scanner` app in Figma. The app is a data-dense operational dashboard called **Rebate Intelligence** for award-to-rebate reconciliation, evidence review, workflow status tracking, and report export.

## Overall Product

Create a polished, production-ready B2B dashboard for procurement/rebate operations.

The live app is a Next.js/Tailwind dashboard with:

- Main visible route: `/`
- Product title: **Rebate Intelligence**
- Product subtitle: **Award-to-rebate control**
- Main workspace label: **Rebate recovery cockpit**
- Two primary views:
  - **Analytics**: Exposure, trends and prioritisation
  - **Opportunities**: Evidence queue and follow-up
- A right-side opportunity drawer opened from opportunity cards
- A report builder with PDF/Excel export links
- A loading skeleton state
- Error and empty states

The app should feel like a quiet, high-trust operational finance/control tool, not a marketing page. Use compact typography, dense but legible tables/cards, restrained shadows, and very clear hierarchy.

## Visual System

Use this design language throughout:

- Background: `#F4F7FB` for main app, `#F5F6F8` for loading areas
- Surface/card: `#FFFFFF`
- Primary navy: `#0B1F4D`
- Brand dark blue: `#000046`
- Action/electric blue: `#2A64FF`
- Accent pale blue: `#EEF3FF`
- Accent border: `#B8C7FF`
- Main text: `#101828`
- Secondary text: `#667085`
- Muted text: `#98A2B3`
- Borders: `#E1E7F0`, `#D9E2EF`, `#D0D5DD`
- Pale panel fill: `#F8FAFD`
- Bar background: `#E6ECF5`
- Danger red: `#EF4444`, `#C62828`
- Warning amber: `#F59E0B`
- Success emerald: `#10B981`, `#12B76A`
- Sky: `#0EA5E9`
- Indigo: `#6366F1`
- Violet: `#8B5CF6`
- Slate: `#94A3B8`

Typography:

- Font: Inter or close system sans-serif
- Base font size: 14px
- Body weight: 400
- Cards and labels use small text, mostly 12px and 14px
- Main view heading: 18px semibold
- Card metrics: 18px semibold
- Uppercase metadata labels: 12px semibold uppercase
- Do not use oversized hero typography

Shape and layout:

- Cards: 12px radius (`rounded-xl`)
- Smaller controls/badges: 6px radius (`rounded-md`)
- Borders are 1px
- Main card shadow: `0 12px 34px rgba(15,23,42,0.06)`
- Hover card shadow: `0 18px 44px rgba(42,100,255,0.10)`
- Fixed left sidebar on desktop: 288px wide
- Desktop main content has left margin of 288px
- Mobile uses a sticky top header instead of the sidebar
- Max content width is effectively fluid/full, with comfortable side padding

Animations/states:

- Skeleton pulse fades opacity between 45% and 85%
- Drawer overlay fades in over roughly 160ms
- Drawer slides in from the right over roughly 190ms
- New opportunities have a small pulsing sky-blue dot

## Desktop Layout

Create a desktop frame around 1440px wide.

Left fixed sidebar:

- Width: 288px
- Full height
- White/94% with subtle backdrop blur
- Right border `#D9E2EF`
- Shadow to the right
- Top brand block:
  - Square 36x36 logo tile, radius 8px, background `#0B1F4D`, white letter **R**
  - Text: **Rebate Intelligence**
  - Subtitle: **Award-to-rebate control**
- Navigation:
  - Two stacked full-width buttons
  - Active state: border `#B8C7FF`, background `#EEF3FF`, text `#0B1F4D`, subtle blue shadow
  - Inactive state: transparent border, text `#475467`, hover pale background
  - Analytics description: **Exposure, trends and prioritisation**
  - Opportunities description: **Evidence queue and follow-up**
- Current exposure panel:
  - Label: **Current exposure**
  - Metric: `£7K` style compact currency
  - Text: **6 actionable opportunities**
  - Three mini boxes: Buyer `1`, Supplier `2`, Both `3`
- Bottom run status panel:
  - Green dot if loaded, red dot if error
  - Text: **Run d72f1eec**
  - Completed date/time in muted text

Main area:

- Background `#F4F7FB`
- Padding: 20-40px depending viewport
- Top title row:
  - Eyebrow: **Rebate recovery cockpit** in uppercase electric blue
  - H2: **Analytics** or **Opportunities**
  - Description:
    - Analytics: **Prioritise missing rebate exposure by issue, framework, supplier and buyer.**
    - Opportunities: **Review surfaced awards, confirm evidence and record the follow-up outcome.**
  - Desktop refresh button: **Refresh data**

## Mobile Layout

Create a mobile version around 390px wide.

- Hide desktop sidebar
- Sticky top header:
  - Logo tile with **R**
  - Product title/subtitle
  - Small **Refresh** button
- Under header, show two segmented nav buttons:
  - **Analytics**
  - **Opportunities**
- Content stacks vertically with the same cards and filters wrapping naturally

## Loading State

Create a loading screen:

- Full page background `#F5F6F8`
- Centered max-width content
- Skeleton header: height 56px, radius 12px, `#E4E7EC`
- Four skeleton KPI cards: grid 2 cols mobile, 4 cols desktop, height 112px
- Large skeleton panel: height around 520px
- Use subtle pulsing opacity animation

## Analytics View

The Analytics view contains the KPI row first, then analytics/report panels.

### KPI Row

Four KPI cards in a 2-column grid on smaller screens and 4-column grid on desktop.

Cards:

1. **Missing rebate due now**
   - Value: `£6,961.91`
   - Hint: **Confirmed framework opportunities requiring action**
2. **Estimated total rebate**
   - Value: `£10,899.41`
   - Hint: **Lifetime estimate across confirmed findings**
3. **Open opportunities**
   - Value: `6`
   - Hint: **Buyer, supplier or combined follow-up needed**
4. **On-track award value**
   - Value: `£525,000.00`
   - Hint: **7 confirmed · 3 framework review**

Below KPI cards, show **Workflow exposure** card:

- Heading: **Workflow exposure**
- Caption: **Due-now rebate by current review status**
- Total: `£6,961.91`
- Horizontal segmented bar with status colours
- Status mini cards in a 6-column desktop grid:
  - New: `£6,961.91`, `10 items`, sky dot
  - Acknowledged: `£0.00`, `0 items`, indigo dot
  - In review: `£0.00`, `0 items`, amber dot
  - Outreach sent: `£0.00`, `0 items`, violet dot
  - Resolved: `£0.00`, `0 items`, emerald dot
  - Not relevant: `£0.00`, `0 items`, slate dot

### Report Builder

Create a card titled **Report builder**.

Description:
**Build a focused PDF or Excel pack by buyer, supplier, framework, status, issue and publication period.**

Right-side scope summary:

- Label: **Report scope**
- Main text: **10 opportunities · £6,961.91 due now**
- Subtext: **£10,899.41 lifetime estimate**

Controls in a responsive grid:

- Select: **All buyers**
- Select: **All suppliers**
- Select: **All frameworks**
- Select: **All issues**
- Select: **All statuses**
- Date input: **Report published from**
- Date input: **Report published to**
- Buttons: **Reset**, **PDF**, **Excel**
- Excel button uses active pale-blue styling: border `#B8C7FF`, background `#EEF3FF`, text `#0B1F4D`
- PDF/Reset use white bordered styling

The report export links point to:

- `/api/reconciliation/report?format=pdf`
- `/api/reconciliation/report?format=xlsx`

When filters are selected, query params can include:

- `run_id`
- `buyer`
- `supplier`
- `framework`
- `issue`
- `status`
- `date_from`
- `date_to`

### Analytics Metric Cards

After report builder, create four metric cards:

1. **Due now**
   - `£6,961.91`
   - **Confirmed framework opportunities**
2. **In review / outreach**
   - `£0.00`
   - **Actively being worked or awaiting response**
3. **Lifetime estimate**
   - `£10,899.41`
   - **Across current evidence records**
4. **Award value reviewed**
   - `£2,590,967.56`
   - **7 confirmed opportunities**

### Rebate Exposure Mix

Create a card titled **Rebate exposure mix**.

- Caption: **Due-now rebate split by operational route.**
- Small metric panel:
  - Label: **Due now**
  - Value: `£6,961.91`
- Donut chart, 128-144px diameter
- Donut colours:
  - Buyer-side issue: amber `#F59E0B`
  - Supplier-side issue: sky `#0EA5E9`
  - Buyer + supplier missing: red `#EF4444`
  - Needs review: slate
  - Framework not confirmed: slate
  - On track: emerald
- Legend rows are clickable buttons. Use these live values:
  - **Buyer + supplier missing**: `£3,650.66`
  - **Supplier-side issue**: `£2,130.00`
  - **Buyer-side issue**: `£1,181.25`
  - **On track**: `£0.00`
  - **Framework not confirmed**: `£0.00`

Clicking a legend item drills into Opportunities with the issue filter applied.

### Workflow Value By Status

Create a card titled **Workflow value by status**.

- Caption: **Missing rebate value grouped by operational status.**
- Segmented horizontal bar by review status
- Under it, status buttons/cards:
  - New, Acknowledged, In review, Outreach sent, Resolved, Not relevant
- Clicking a segment/card drills into Opportunities with the status filter applied

### Missing Rebate Panels

Create a 2-column desktop grid:

1. **Missing rebate by issue**
   - Caption: **Prioritise the operational route: buyer check, supplier outreach, or both.**
   - Horizontal bar list using issue rows and due-now values
2. **Missing rebate by framework**
   - Caption: **Framework-register confirmed only; unconfirmed items stay out of this total.**
   - Bar list:
     - Y23031: 1 opportunity, `£3,650.66`
     - Y23065: 4 opportunities, `£2,261.25`
     - Y21012: 1 opportunity, `£1,050.00`
     - Y24024: 1 opportunity, `£0.00`
     - Unresolved: 2 opportunities, `£0.00`
     - Y23022: 1 opportunity, `£0.00`

Create another 2-column grid:

1. **Supplier exposure**
   - Caption: **Largest due-now amounts by supplier across confirmed opportunities.**
   - Bar list:
     - DCVS Trading Ltd (trading as Herts Interpreting and Translation: `£3,650.66`
     - Softcat Plc: `£1,181.25`
     - CDW Limited: `£1,080.00`
     - Browne Jacobson LLP: `£1,050.00`
2. **Review progress**
   - Caption: **Operational status across all surfaced opportunities.**
   - Count segmented bar
   - Due-now status bar list

### Ranked Tables

Create two wide cards with tables.

Table style:

- Card border/radius/shadow
- Header background `#F8FAFD`
- Columns: **Name**, **Opportunities**, **Due now**, **Lifetime estimate**, **Award value**
- Name appears as clickable navy text with underline on hover

Customer rebate concentration:

- Description: **Total due-now rebate by buyer/customer.**
- Rows:
  - West Hertfordshire Teaching Hospitals NHS Trust | 1 | `£3,650.66` | `£3,650.66` | `£486,755.00`
  - The Mayor and Commonalty and Citizens of the City of London | 1 | `£1,181.25` | `£1,181.25` | `£157,500.00`
  - British Transport Police | 2 | `£1,080.00` | `£5,017.50` | `£669,000.00`
  - Northumberland County Council | 1 | `£1,050.00` | `£1,050.00` | `£140,000.00`

Supplier rebate concentration:

- Description: **Total due-now rebate by supplier.**
- Rows:
  - DCVS Trading Ltd (trading as Herts Interpreting and Translation | 1 | `£3,650.66` | `£3,650.66` | `£486,755.00`
  - Softcat Plc | 1 | `£1,181.25` | `£1,181.25` | `£157,500.00`
  - CDW Limited | 1 | `£1,080.00` | `£1,080.00` | `£144,000.00`
  - Browne Jacobson LLP | 1 | `£1,050.00` | `£1,050.00` | `£140,000.00`

All chart/table rows are clickable and drill into the Opportunities view with the matching filter.

## Opportunities View

The Opportunities view repeats the KPI row, then shows a searchable/filterable opportunity pipeline.

Header:

- Title: **Matched Award Opportunities**
- Description: **Review surfaced awards, confirm the evidence trail, and record the operational outcome for the next reviewer.**

Filter/control row:

- Search input placeholder: **Search buyer, supplier, framework**
- Select: **All buyers**
- Select: **All suppliers**
- Select: **All frameworks**
- Select: **All issues**
- Select: **All statuses**
- Date input: **Published from**
- Date input: **Published to**
- Button: **Reset**

Issue filter options:

- All issues
- Buyer-side issue
- Supplier-side issue
- Buyer + supplier missing
- Needs review
- Framework not confirmed
- On track

Status filter options:

- All statuses
- New
- Acknowledged
- In review
- Outreach sent
- Resolved
- Not relevant

Opportunity cards:

- Full-width cards stacked vertically
- Left rail colour based on review status
- Header band contains badges:
  - Opportunity issue badge
  - Review status badge
  - Finding confidence badge
- New status shows a small pulsing sky dot in top-right
- Card body desktop grid: buyer/supplier, framework, financial metrics, recommended action
- Hover changes border to `#B8C7FF` and adds stronger blue shadow

Opportunity card content:

- Buyer section:
  - Label **Buyer**
  - Buyer name
  - Label **Supplier**
  - Supplier name
  - Two small fact cards:
    - **Published**
    - **Related month**
  - Contract description/explanation line clamped to two lines
- Framework panel:
  - Label **Framework**
  - Monospace framework reference
  - Optional framework name
  - Framework register badge
- Financial metric grid:
  - **Due now**
  - **Award value**
  - **Potential total**
  - **Notes**
- Recommended next step:
  - Label **Recommended next step**
  - Action text based on issue
  - Buyer/Supplier evidence chips
  - Award match confidence badge
  - Published date
  - Button: **View evidence and update**
- Bottom evidence box:
  - Label **Award surfacing evidence**
  - Matching/evidence rationale text, line clamped

Sample live opportunity cards:

1. Buyer-side issue
   - Review status: New
   - Evidence confidence: LOW evidence
   - Buyer: **The Mayor and Commonalty and Citizens of the City of London**
   - Supplier: **Softcat Plc**
   - Framework: **Y23065**
   - Published: **23 Jun 2026**
   - Related month: **June 2026**
   - Contract: **Threat Intelligence Software**
   - Due now: `£1,181.25`
   - Award value: `£157,500.00`
   - Potential total: `£1,181.25`
   - Buyer evidence: `CAA ONLY`
   - Supplier evidence: `ON SCHEDULE`
   - Award match: High match
   - Recommended next step: **Check buyer access/COA record, then update the rebate log or confirm why it is not required.**

2. Supplier-side issue
   - Review status: New
   - Evidence confidence: MEDIUM evidence
   - Buyer: **Northumberland County Council**
   - Supplier: **Browne Jacobson LLP**
   - Framework: **Y21012**
   - Published: **18 Jun 2026**
   - Related month: **June 2026**
   - Contract: **Direct Award via Procurement Services - Y21012 Legal Service Framework**
   - Due now: `£1,050.00`
   - Award value: `£140,000.00`
   - Potential total: `£1,050.00`
   - Buyer evidence: `COA CONFIRMED`
   - Supplier evidence: `NO CYCLE DEFINED`
   - Award match: High match
   - Recommended next step: **Request supplier spend confirmation for the framework and reporting period.**

3. Buyer + supplier missing
   - Review status: New
   - Evidence confidence: MEDIUM evidence
   - Buyer: **West Hertfordshire Teaching Hospitals NHS Trust**
   - Supplier: **DCVS Trading Ltd (trading as Herts Interpreting and Translation**
   - Framework: **Y23031**
   - Published: **11 Jun 2026**
   - Related month: **June 2026**
   - Contract: **WHHT - Interpretation & Translation Services & BSL**
   - Due now: `£3,650.66`
   - Award value: `£486,755.00`
   - Potential total: `£3,650.66`
   - Buyer evidence: `CAA ONLY`
   - Supplier evidence: `NO CYCLE DEFINED`
   - Award match: High match
   - Recommended next step: **Confirm buyer access and request supplier spend declaration before counting the rebate as secured.**

4. On track
   - Review status: New
   - Evidence confidence: HIGH evidence
   - Buyer: **British Transport Police**
   - Supplier: **Phoenix Software Limited**
   - Framework: **Y23065**
   - Published: **03 Jun 2026**
   - Related month: **June 2026**
   - Contract: **Microsoft Azure Overage**
   - Due now: `£0.00`
   - Award value: `£525,000.00`
   - Potential total: `£3,937.50`
   - Buyer evidence: `COA CONFIRMED`
   - Supplier evidence: `ON SCHEDULE`
   - Award match: High match
   - Recommended next step: **No follow-up needed unless the evidence is challenged.**

## Badges And Chips

Finding confidence badge:

- HIGH: green border/fill/text, label **HIGH evidence**
- MEDIUM: amber, label **MEDIUM evidence**
- LOW: red, label **LOW evidence**
- null: slate, label **Unknown evidence**

Award match confidence badge:

- High: green, label **High match**
- Medium: amber, label **Medium match**
- Low: red, label **Low match**
- Unknown: slate, label **Unknown match**

Framework register badge:

- Confirmed: green, label **Framework confirmed**
- Timing review: amber, label **Framework timing review**
- Unconfirmed/unresolved: slate, label **Framework not confirmed** or **Framework unresolved**

Evidence chips:

- Buyer/Supplier positive verdicts:
  - `COA_CONFIRMED`
  - `ON_SCHEDULE`
  - Green
- Missing/negative/ambiguous verdicts:
  - `CAA_ONLY`
  - `NO_RECORD`
  - `OFF_CYCLE`
  - `MISSING_FOR_DUE_PERIOD`
  - `NO_CYCLE_DEFINED`
  - Amber
- No verdict: slate, label **Not reached**

Opportunity issue badges:

- Buyer-side issue: amber
- Supplier-side issue: sky/blue
- Buyer + supplier missing: red
- Needs review: slate
- On track: emerald
- Framework not confirmed: slate

Review status badges:

- New: sky, pulsing dot, description **Not yet looked at**
- Acknowledged: indigo, description **Seen but not worked yet**
- In review: amber, description **Evidence is being checked**
- Outreach sent: violet, description **Waiting for buyer or supplier response**
- Resolved: emerald, description **Action complete**
- Not relevant: slate, description **Dismissed from active work**

## Opportunity Drawer

When the user clicks **View evidence and update**, open a right-side drawer.

Drawer:

- Overlay: dark `#020612` at 62% opacity with backdrop blur
- Drawer width: full on mobile, max 760px on desktop
- Drawer slides in from right
- Background: `#F4F7FB`
- Header is sticky, white/92% with blur and bottom border
- Close button is a square 32x32 icon button with `x`
- Escape key and overlay click close the drawer

Drawer header:

- Badges: issue, review status, confidence
- Title: buyer organisation
- Subtitle: supplier + framework reference

First drawer card:

- Three metrics:
  - **Due now**
  - **Potential total**
  - **Award value**
- Recommended next step panel

Review outcome card:

- Heading: **Review outcome**
- Description: **Update status, adjust due-now rebate, and leave notes for the next reviewer.**
- Button: **Save review**
- Status buttons:
  - New
  - Acknowledged
  - In review
  - Outreach sent
  - Resolved
  - Not relevant
- Input:
  - Label **Due-now rebate**
- Textarea:
  - Label **Add note**
  - Placeholder: **Record what was checked, who was contacted, or why this was marked not relevant.**
- Notes history section:
  - If none: **No notes have been added yet.**

Award evidence card:

- Chip: award match confidence
- Framework register badge
- Reason panel explaining register status
- Detail grid:
  - Framework reference
  - Framework name
  - Published
  - Award date
  - Source
  - Candidate ID
- Contract description paragraph
- Award surfacing rationale panel
- Source link: **Open source notice**

Reconciliation finding card:

- Finding confidence badge
- Finding code label
- Explanation paragraph

Evidence trail card:

- Title: **Evidence trail**
- Caption: **Source checks and rationale persisted by the run.**
- If source refs exist, show chip like `N source refs`
- Ordered vertical list with six steps:
  1. Award source
  2. Framework rate
  3. Buyer COA evidence
  4. Supplier spend evidence
  5. Evidence judge
  6. Final finding
- Each step is a bordered pale panel with:
  - State badge:
    - Checked: green
    - Review: amber
    - Absent: red
    - Not reached: slate
  - Step title
  - Summary
  - Optional detail
  - Optional monospace reference/source URL

Buyer evidence panel:

- Title: **Internal buyer evidence**
- Buyer evidence chip
- Evidence excerpt
- Detail grid:
  - Workbook tab
  - Matched row
  - COA
  - CAA
  - Award date
  - Expiry date
- Optional amber ambiguity note
- Empty text: **No buyer evidence was produced for this finding.**

Supplier evidence panel:

- Title: **Internal supplier evidence**
- Supplier evidence chip
- Evidence excerpt
- Detail grid:
  - Workbook tab
  - Matched row
  - Last period
  - Last spend
  - Reporting cycle
- Empty text: **No supplier evidence was produced for this finding.**

Evidence judge panel:

- Title: **Evidence judge**
- Status pills:
  - Buyer passed/flagged
  - Supplier passed/flagged
  - Cross-evidence conflict / No cross-evidence conflict
- Optional buyer assessment
- Optional supplier assessment
- Optional amber cross-check note
- Empty text: **No judge result was produced for this finding.**

Audit links panel:

- Title: **Audit links**
- Detail grid:
  - External awards
  - Rebate records
  - Invoice rows
  - Run ID

## Error And Empty States

Loading list state:

- Six skeleton rows, each 56px high, white card with border

Error state:

- Red-tinted card
- Title: **Unable to load reconciliation data**
- Body contains error text

Empty state:

- Dashed border `#CBD5E1`
- White background
- Centered muted text
- Default: **No records match the current filters.**
- Opportunities empty: **No opportunities match the current filters.**
- Analytics empty: **No analytics data is available.**

## Scan Awards Panel

This component exists in the front-end code but is not currently mounted on the main route. Include it as an optional screen/component in the Figma file.

Create a card titled **Scan Awards**.

Description:
**Step 1 scans all five external sources. Step 2 separately reconciles only the newly persisted awards.**

Source chips:

- Find a Tender
- Contracts Finder
- Public Contracts Scotland
- Sell2Wales
- eTendersNI

Controls:

- Month select with January-December
- Year select spanning eight years around the current year
- Primary blue button:
  - Idle: **Step 1: Scan [Month] Awards**
  - Working: **Scanning... 12s**
- Secondary button:
  - Idle: **Step 2: Run Evidence Reconciliation**
  - Working: **Reconciling... 12s**

Important design note: For the scan panel, do not pre-populate the manual scan results area with fake data. Show the idle state or empty state by default, because the user should manually run the scan themselves. It is acceptable to show the structural UI and loading/result states as examples, but mark them as optional states.

Scan states:

- Scanning message:
  - **External scan in progress**
  - **Fetching award notices, deduplicating candidates, running AI classification and persisting qualified awards.**
- Scan complete coverage banner:
  - **Source coverage: Complete**
  - **Every configured source completed.**
- Partial scan coverage banner:
  - **Source coverage: Partial**
  - **Saved results are valid, but one or more sources were incomplete.**
- Stat cards:
  - Raw notices
  - Awards found
  - Awards persisted
  - Previously stored
- No new awards note:
  - **The scan completed without any new awards. Step 2 can still reconcile the stored awards shown below.**
- Reconciling message:
  - **Reconciliation in progress**
  - **Comparing N stored award(s) with the three SharePoint workbooks.**
- Reconciled message:
  - **Reconciliation completed · N finding(s)**
  - **Run [id]**

Monthly Rebate Exposure panel:

- Left metric panel:
  - Label: **Monthly Rebate Exposure**
  - Main metric: confirmed missing / at-risk rebate
  - Stats:
    - Awards reviewed
    - Award value
    - Supplier issue
    - Buyer issue
  - One-side issue combined box
- Right-side bar rows:
  - Supplier-side issue
  - Buyer-side issue
  - Both sides missing
  - Needs review
  - Framework not confirmed
  - On track

Stored awards table:

- Header: **Stored [Month] [Year] Awards**
- Subtitle: `N awards with external award evidence and reconciliation status`
- Table columns:
  - Buyer
  - Supplier
  - Published
  - Award date
  - Framework
  - Award value
  - Award match
  - Match evidence
  - Evidence confidence
  - Outcome
- Empty row: **No stored awards for this month yet.**
- Pending evidence chip: **LangGraph evidence not completed**
- Not reconciled chip: **Not reconciled yet**

## Older Award Scanner Components

These components exist in the repository but are not the current main page. Capture them as a legacy/secondary screen if helpful.

### Search Panel

White rounded card with:

- Year select
- Publication month select
- Helper text: **Award dates may be earlier; both dates are shown in results.**
- Framework ID input, placeholder **e.g. Y23023**
- Toggle switches:
  - Cross-check Contracts Finder
  - Include eTendersNI
  - Strict mode
- Advanced collapsible button:
  - **Add exclusion list**
  - **Hide exclusion list**
- Exclusion list textarea placeholder:

```text
Paste previously matched awards here.
Format: Buyer | Supplier | Y23023
One entry per line.
```

- Purple primary button:
  - **Search**
  - Loading: **Searching...**

### Results Panel

States:

- Loading:
  - Spinner
  - **Querying procurement APIs and classifying notices...**
  - **This may take up to 30 seconds for large months**
- Initial:
  - Magnifying glass icon
  - **Select a year and month, then click Search**
  - **Results will appear here**
- Error:
  - Red panel with **Error:**
- Incomplete scan:
  - Amber panel
  - **Incomplete scan - do not treat this result as exhaustive.**
- Stats:
  - Raw notices
  - Qualified
  - Excluded
  - Month label
  - Model token usage
- Export buttons:
  - Export JSON
  - Export CSV
- Empty:
  - **No qualifying new Procurement Services awards found**
  - **Try a different month or check back later.**
- Result cards with supplier/buyer/description/framework hints/facts/evidence/source
- Debug panel:
  - **Debug - Rejected candidates (N)**

### Result Card

White card with:

- Index badge like `#1`
- Confidence badge
- Icon buttons:
  - Copy JSON
  - Open notice
- Supplier and buyer names
- Contract description
- Framework hint pills
- Fact items:
  - Award date
  - Publication date
  - Award value
- Expand/collapse evidence:
  - **Show evidence**
  - **Hide evidence**
- Footer:
  - First seen date
  - Source name

### History Panel

States:

- Loading: **Loading history...**
- Empty:
  - **No history yet**
  - **Run a search and results will be saved here automatically.**
- Summary text:
  - `N contracts stored across M months`
- Month accordion:
  - Month/year
  - Contract count
  - Expanded contract rows with confidence, framework hints, supplier, buyer, description, dates, value
  - Actions:
    - Open notice
    - Remove from history

### Schedule Panel

States:

- Header text:
  - **Schedules run automatically every hour and save any new contracts found to memory.**
- Button: **New Schedule**
- New scheduled search form:
  - Year select
  - Month select
  - Framework ID input
  - Cross-check Contracts Finder checkbox
  - Strict mode checkbox
  - Create Schedule button
  - Cancel button
- Empty:
  - **No schedules yet**
  - **Create a schedule to automatically search for new contracts every hour.**
- Schedule rows support:
  - Toggle active
  - Run now
  - Delete

## Live Data Contract

The dashboard gets its visible data from live server/database reads, not hardcoded dummy records.

Main page loading flow:

- `src/app/page.tsx` calls `loadDashboardData`
- It resolves a reconciliation run:
  - Uses `?run_id=` if present
  - Otherwise uses `RECONCILIATION_DASHBOARD_RUN_ID`
  - Otherwise uses the most recent completed/incomplete run with findings
- If no explicit run is configured, it loads the latest findings for the previous complete month
- It returns:
  - `run`
  - `findings`
  - `error`

Current live run used for this prompt:

- Run ID: `d72f1eec-04cb-45b2-aaa1-6cdc2aee61a7`
- Status: `incomplete`
- Created: `2026-07-09T23:35:47.001Z`
- Completed: `2026-07-09T23:41:08.112Z`
- Finding count: `10`
- External award count: `15`

Current live summary:

- Total findings: `10`
- Due now: `£6,961.91`
- Lifetime estimate: `£10,899.41`
- Award value reviewed: `£2,590,967.56`
- Status distribution:
  - New: 10, due now `£6,961.91`
  - Acknowledged: 0
  - In review: 0
  - Outreach sent: 0
  - Resolved: 0
  - Not relevant: 0
- Issue distribution:
  - Buyer + supplier missing: 3, due now `£3,650.66`
  - Supplier-side issue: 2, due now `£2,130.00`
  - Buyer-side issue: 1, due now `£1,181.25`
  - On track: 1, due now `£0.00`
  - Framework not confirmed: 3, due now `£0.00`
- Finding codes:
  - AMBIGUOUS_MATCH: 3
  - COA_NO_SUPPLIER_SPEND: 1
  - MATCHED: 1
  - EXTERNAL_AWARD_MISSING_REBATE_LOG: 5
- Confidence:
  - HIGH: 4
  - MEDIUM: 2
  - LOW: 4

Key data types shown by the UI:

- `ReconciliationRunSummary`
  - `id`
  - `operation`
  - `status`
  - `created_at`
  - `completed_at`
  - `external_award_count`
  - `finding_count`
  - `framework_rule_count`
  - `rebate_check_record_count`
  - `invoice_spend_record_count`
- `ReconciliationFindingRecord`
  - `id`
  - `run_id`
  - `finding_code`
  - `framework_reference`
  - `organisation_display`
  - `supplier_display`
  - `expected_rebate`
  - `reported_rebate`
  - `award_contract_value`
  - `potential_rebate_lifetime_max`
  - `confidence_tier`
  - `explanation`
  - `buyer_evidence`
  - `supplier_evidence`
  - `judge_result`
  - `external_awards`
  - `opportunity_review`
- `ExternalAwardSummary`
  - `candidate_id`
  - `source`
  - `buyer_name`
  - `supplier_name`
  - `contract_description`
  - `award_date`
  - `publication_date`
  - `award_value`
  - `currency`
  - `confidence`
  - `framework_hints`
  - `source_url`
  - `evidence_excerpt`

Data endpoints used by the front-end:

- `/api/history`
  - `GET /api/history` returns `{ summary }`
  - `GET /api/history?year=YYYY&month=M` returns `{ contracts }`
  - `DELETE /api/history?id=ID` deletes a stored contract
- `/api/reconciliation/monthly-summary?year=YYYY&month=M`
  - Returns stored awards count/value, evidence award count, missing/at-risk totals, categories, confidence, and finding code counts
- `/api/reconciliation/report?format=pdf|xlsx`
  - Produces report exports with optional filters
- Server actions:
  - `runExternalScanAction({ year, month })`
  - `runReconciliationAction(awardIds)`
  - `updateOpportunityReviewAction({ opportunityKey, status, note, dueNowRebate, updatedBy })`

## Source Files Used To Extract This Prompt

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/loading.tsx`
- `src/app/globals.css`
- `src/styles/theme.css`
- `src/components/reconciliation/DashboardShell.tsx`
- `src/components/reconciliation/KpiRow.tsx`
- `src/components/reconciliation/ReportsTab.tsx`
- `src/components/reconciliation/PipelineTab.tsx`
- `src/components/reconciliation/CaseDrawer.tsx`
- `src/components/reconciliation/EvidenceTrail.tsx`
- `src/components/reconciliation/Badges.tsx`
- `src/components/reconciliation/DataState.tsx`
- `src/components/reconciliation/ScanAwardsPanel.tsx`
- `src/components/reconciliation/ActionsTab.tsx`
- `src/components/reconciliation/CasesTab.tsx`
- `src/components/reconciliation/format.ts`
- `src/components/reconciliation/opportunityModel.ts`
- `src/components/reconciliation/statusMapping.ts`
- `src/components/reconciliation/types.ts`
- `src/components/SearchPanel.tsx`
- `src/components/ResultsPanel.tsx`
- `src/components/ResultCard.tsx`
- `src/components/HistoryPanel.tsx`
- `src/components/SchedulePanel.tsx`
- `src/components/ExportButtons.tsx`
- `src/app/api/history/route.ts`
- `src/app/api/reconciliation/monthly-summary/route.ts`
- `src/app/api/reconciliation/report/route.ts`

