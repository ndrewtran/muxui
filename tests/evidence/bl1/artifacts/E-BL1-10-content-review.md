# E-BL1-10 content review record: BL1 blocks after the workspace navigation block

**Reviewer:** independent read-only reviewer agent (Claude Opus), not the authoring agents.
**Source revision:** `e9a470c26afec974dba93a2daa5b1c95b7071b00`. Primary checkout on `main` at `e9a470c2` (PR #247), clean worktree (`git status --short` empty).
**Date:** 2026-10-10.
**Revision note:** during the review, an outside `git merge origin/main` fast-forwarded the checkout to `bcb671e1` (PR #248, Decision 0027). That commit changes only `README.md`, `docs/`, `decisions/`, and `strategy/`. The `catalog/patterns` tree at `bcb671e1` is the same tree as at `e9a470c2`, so this review applies unchanged. All line numbers below are at `e9a470c2`. At `bcb671e1`, the unchanged `SCOPE-NONGOAL-008` row is at `strategy/product-scope.md:162` and the unchanged `E-BL1-10` row at `strategy/milestone-roadmap.md:622`.

## Method

- **Authority:**
  - Decision 0026 (`decisions/0026-blocks-showcase-admission.md`): item 6 (block boundary, bounded-section test, content rules; lines 122-148), item 8 (growth; lines 184-192), and item 9 (evidence, Decision 0022 carry-over; lines 194-216). The item 2 closed category enum (lines 45-50) was used for the category check.
  - Decision 0026 amendments 01 (page-width presets) and 02 (category-name queries). Neither changes a content rule.
  - `SCOPE-NONGOAL-008` in `strategy/product-scope.md:279`, Decision 0022, and the Roadmap `E-BL1-10` row (`strategy/milestone-roadmap.md:1316`). Both moved since the last review only because Product Scope 19.0.0 and the Decision 0023 amendment 01 R1 exit edit added lines above them; neither row's text changed.
  - The scanner contract in `packages/catalog/src/pattern-content.mjs:1-58`, unchanged since bb609726.
- **Block files:** for each of `catalog/patterns/{poster-grid,marketing-hero,pricing-plans,account-settings,company-records,task-filters,workspace-navigation}`, every variant `.tsx` (nine in all), every `.example.json`, and `artifact.json`.
- **Change since the last review:** `git diff bb609726 e9a470c2 -- catalog/patterns/` only adds the three workspace-navigation files. The six earlier blocks are byte-identical to the bb609726 review (the four seed blocks also to 670cb188), so their findings carry forward. They were re-scanned, and their advisories were re-checked against the current tree. Outside the block directories, the range also changes the Sidebar component record and example (PRs #243, #244). That is component content, not block content, and it was read only where a new-block note depends on Sidebar behaviour.
- **Scans, all seven directories:**
  - `auditPatternAssets`, `scanPatternContent`, and `scanLocalReferences` from `packages/catalog/src/pattern-content.mjs` were run read-only from a Node script outside the repository. They covered all nine variant sources, with each directory's records and sources as its known files. Result: zero violations in every file and zero asset issues, and every licensed set is empty. Positive controls (a hex colour beside a remote `url()`, and `href="/pricing"`) raised `content.colour-literal`, `content.remote-reference`, and `content.local-reference`, so the scan was live.
  - Grep for URLs, `url()`, `@import`, `href`, `src=`, `srcSet`, and asset extensions. The only URL is the SVG-namespace data URI already passed in poster-grid (`css-grid.tsx:21`, `virtualized.tsx:29`). The new block has 13 `href` values, all `#fragment` (`foldable.tsx:39-48,157`), and no `src`, `url()`, or `@import`.
  - Grep for hex colours, colour functions, and common named colours. No literal colour; the only hits are `white-space: nowrap` in the earlier blocks. Every colour-carrying declaration or attribute in the new block is a `--muxui-semantic-*` token, `transparent`, `inherit`, `none`, or `currentColor` (`foldable.tsx:6,72-131`).
  - Claim words: accessible, tested, supported, compliant, certified, a11y, assistive, screen reader, VoiceOver, NVDA, JAWS, TalkBack, Narrator, WCAG, guarantee. No claim. The hits are:
    - the `accessibility` and `unsupported` field names in all seven records;
    - "supporting text" (`marketing-hero/artifact.json:6`) and the ARIA term "accessible name" (`poster-grid/artifact.json:70`);
    - the placeholder plan features "Community support", "Email support", and "Priority support" (`pricing-plans/examples/react/columns.tsx:7-9`), and the team "Support" (`task-filters`, both variants, line 9);
    - "hidden from assistive technology", carried forward under Cross-block checks.
    - The bb609726 record listed only the field names and "Support". The other hits were already in those byte-identical files, and none is a claim.
  - Brand and sample-data terms: Acme, Northwind, Contoso, Fabrikam, Initech, Globex, Hooli, product brands such as Linear, Notion, Slack, GitHub, Figma, and Stripe, CRM brands such as Twenty, Attio, HubSpot, and Salesforce, "lorem ipsum", and common placeholder person names. No match in any block.
  - Source-demo terms for the new block, from the brief's list of the BeUI animated sidebar demo: Acme Inc, Ava Stone, ava@solace.app, "Good morning, Ava.", "Wednesday, July 29", Search, AI Assistant, Inbox (4), WORKSPACES, People, Companies, Opportunities, Tasks, Notes, Workflows, Dashboard, and "Press ⌘B to toggle". Results are under Workspace navigation below.
  - Icon provenance: the ten inline icon paths in the new block were compared segment by segment with `lucide-react` 1.37.0, the icon set `@muxui/react` already depends on. Results are under Workspace navigation below.
- **Assets:** no block directory holds any file except its records and variant sources. No asset or `.license.json` exists in any of the seven blocks, and none is required.
- **Limits:** the review did not run the compiler, the test suites, the browser suites, the capture script, or the docs site. The scanner functions were run on their own. Browser test sources were read, not run, to see which behaviour notes they assert. The reviewer has no copy of the BeUI demo, so freshness was checked only against the demo data the brief lists.

## Per-block findings

**Poster grid** (unchanged since 670cb188)
- Copy is generic: "Sample Title" style titles, plus "Details", "Save", and "Posters" (`catalog/patterns/poster-grid/examples/react/css-grid.tsx:5-18`, `catalog/patterns/poster-grid/examples/react/virtualized.tsx:6-19`).
- Imagery is an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:29`). Links are `#fragment` placeholders.
- Bounded-section test: pass. Only local column state is kept, and there is no fetch and no routing.
- Advisory (carried forward, still present): `catalog/patterns/poster-grid/examples/react/virtualized.tsx:11` titles a card "A Disabled Sample Title…" while only `index % 11 === 10` is disabled (`virtualized.tsx:25`). This is misleading demonstration copy, not a content-rule breach.

**Marketing hero** (unchanged since 670cb188)
- Copy is generic: "Introduce your product", the descriptive line, "Get started", and "See an example" (`catalog/patterns/marketing-hero/examples/react/split.tsx:77-78`).
- The visual is Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:85-101`), with no initials, text, or mark.
- Bounded-section test: pass.

**Pricing plans** (unchanged since 670cb188)
- Plan names, features, and prices are generic (`catalog/patterns/pricing-plans/examples/react/columns.tsx:6-10`).
- Only the local `period` toggle holds state, and the CTAs are inert.
- Bounded-section test: pass.
- Advisory (carried forward, still present): "Start free and upgrade when you need more" (`catalog/patterns/pricing-plans/examples/react/columns.tsx:127`) carries no in-block placeholder marker. The record calls the prices placeholders, and `SCOPE-NONGOAL-008` covers them, so this is acceptable.

**Account settings** (unchanged since 670cb188)
- Sample data is "Sample user" and `sample@example.com` (`catalog/patterns/account-settings/examples/react/sections.tsx:4`).
- The form calls `preventDefault` and only moves a local snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists.
- Bounded-section test: pass.

**Company records** (unchanged since bb609726, Collections)
- The bb609726 findings carry forward:
  - placeholder companies built from obvious placeholder words, with real city names, generic tags, and no person or owner column (`catalog/patterns/company-records/examples/react/sortable.tsx:6-15`);
  - no reuse of the earlier source demo or mock;
  - one Mux-authored inline SVG (`sortable.tsx:45-49`) and token-only CSS;
  - bounded-section test pass, with local `query`, `sort`, and `selected` state only (`sortable.tsx:32-35`);
  - imports matching declared participants, and no AT or support claim (`catalog/patterns/company-records/artifact.json:64-73`).
- Advisory (carried forward, still present): "Generic Supply" (`sortable.tsx:11`) shares the common noun "Supply" with the earlier mock's "Northwind Supply". It is not reuse.
- Advisory (refined): the forced-colours note at `catalog/patterns/company-records/artifact.json:71` is asserted by an emulated forced-colours browser test (`packages/react/test/browser/pattern-company-records.test.mjs:270`, present at bb609726), so the bb609726 record overstated the gap.
  - The test emulates forced colours; it was not run in a real forced-colours environment. This is a CSS mechanism note, not an AT or support claim.

**Task filters** (unchanged since bb609726, Collections)
- The bb609726 findings carry forward:
  - the same eight generic office tasks, dates, statuses, and team owners in both variants, with no person's name (`catalog/patterns/task-filters/examples/react/filter-bar.tsx:4-13`, `catalog/patterns/task-filters/examples/react/status-buttons.tsx:4-13`);
  - no reuse of the earlier source demo or mock;
  - no imagery;
  - bounded-section test pass, with local `query`, `status`, and `filter` state only;
  - imports matching declared participants, and no AT or support claim (`catalog/patterns/task-filters/artifact.json:75-84`).
- Advisory (carried forward, still present): "Review the draft outline" (`filter-bar.tsx:6`, `status-buttons.tsx:6`) shares "Review" and "draft" with the earlier mock's "Review the menu draft". It is not reuse.

**Workspace navigation** (new, Navigation)
- **Category:** `navigation` is in the Application group of the Decision 0026 item 2 closed enum (decision lines 45-46) and in `packages/schema/schemas/pattern.schema.json:51-53` since PR #224. This is the first block in that category, not a new category, so item 8 growth applies without a further decision (`catalog/patterns/workspace-navigation/artifact.json:21`).
- **Placeholder data**, `catalog/patterns/workspace-navigation/examples/react/foldable.tsx`:
  - Workspace: "Sample workspace" on the switcher and the drawer header (lines 28, 151), the menu items "Sample workspace" and "Example team" (line 32), and an Avatar fallback initial "S" with no image (line 27).
  - Account: "Sample user" and `sample@example.com` (line 52), the same placeholder as account-settings. `example.com` is a reserved example domain. No `avatarSrc` is passed, so the Sidebar renders only the initial (`packages/react/src/supplemental/index.mjs:1319`).
  - Links: Inbox (badge "3"), Updates, and Saved, then a "Projects" section with Overview (current), Roadmap (Now, Next, Later), Reviews (badge "12"), Files, Reports (Weekly, Quarterly), and Settings (lines 39-48).
  - Main pane: the breadcrumb Projects / Overview, the heading "Overview", and "This pane holds your page content." (lines 157-160).
  - No real person, company, or product is named. "Now, Next, Later" is a common generic roadmap convention, not a brand or mark.
- **Freshness against the source demo:**
  - No distinctive demo data reappears. There is no "Acme Inc", "Ava Stone", "ava@solace.app", greeting, or date. There is no "AI Assistant", "WORKSPACES" label, People, Companies, Opportunities, Tasks, Notes, Workflows, or Dashboard item, and no "Press ⌘B to toggle" text. The theme is a generic project workspace, not a CRM.
  - Generic overlaps:
    - "Search" is the Sidebar component's default placeholder (`index.mjs:1275`), not block copy.
    - "Inbox" with a count badge is a generic inbox item, and the count differs (3, not 4).
    - "workspace" appears as the block's name and in the "Sample workspace" placeholder, not as a "Workspaces" section label. The block's section label is "Projects".
  - Advisory: the Cmd or Ctrl plus B fold shortcut (`shortcut="b"`, line 148; disclosed at `artifact.json:62`) matches the demo's ⌘B toggle. It is a common sidebar-toggle convention and a behaviour, not copy, and the block renders no shortcut hint, so this is not reuse.
- **Copy:** "Sample workspace", "Example team", "Workspace links", the link and section labels above, "Breadcrumb", "Workspace", "Overview", and "This pane holds your page content." It is generic and Mux-authored, and makes no product or quality claim. Labels the components own ("Toggle sidebar", "Search", "Open navigation", "Close navigation", "Navigation", "Account options"; `index.mjs:1272,1275,1319,1352-1353`) are generic too.
- **Imagery:** ten inline stroke icons made by one local factory (`foldable.tsx:5-19`), with `fill="none"`, `stroke="currentColor"`, and `aria-hidden`. There is no raster, no data URI, and no mark.
  - Nine of the ten paths match no Lucide icon.
  - Advisory: the `Switch` icon (`foldable.tsx:19`) has the same geometry as Lucide's `chevrons-up-down`, which the Sidebar account card imports (`index.mjs:54`). Two plain chevrons, ISC-licensed and listed in `packages/react/NOTICE`, and not a mark, so it does not block.
    - Redrawing the icon, or noting that it follows Lucide, would make its Mux-authored provenance exact. Path: `m7 15 5 5 5-5M7 9l5-5 5 5` against Lucide `m7 15 5 5 5-5`, `m7 9 5-5 5 5`.
- **Bounded-section test: pass.**
  - One bounded frame (`.workspace`, lines 67-74, 149) holds the navigation column (or its drawer below 40rem) and a placeholder main pane. The pane holds only a breadcrumb, a heading, and one sentence (lines 154-161). The region is the navigation shell; it composes no page content.
  - No routing: there is no router, route state, or navigation logic. Every href is a `#fragment`, and the current link is fixed in the source (line 43), as `artifact.json:69` discloses.
  - State is local presentation only, and it lives in the components: the fold (`Sidebar.Provider`, uncontrolled), native `details` groups, the menu, and the drawer. The block itself keeps no state; it calls only `useId` (line 57). The shortcut listens on the document (`index.mjs:1204-1206`) but changes only the local fold.
  - No fetch, submission, or persistence. The menu items, Search, and badges are inert placeholders (`artifact.json:71-73`), and the fold resets on reload (`artifact.json:70`).
  - Advisory: of the seven blocks, this one is closest to a page shell. It stays one region because the main pane is only a placeholder. Filling that pane with page content would move it toward the page templates that item 6 excludes.
- **Imports vs participants:** Avatar, Breadcrumbs, Menu, Sidebar, and Text (line 2) all match declared participants (`artifact.json:32-58`), and all five are catalog components at e9a470c2. The plain markup is `div`, `nav`, `section`, `style`, and inline `svg`.
- **Claims:** the accessibility notes (`artifact.json:60-67`) cover several points. They make no "accessible", "tested", "supported", "compliant", WCAG, or screen-reader claim (Decision 0022). The points are:
  - landmarks and names set by `aria-label`;
  - `aria-expanded` and `aria-controls` on the fold button, and the shortcut;
  - rail tooltips, native disclosures, and `aria-current`;
  - the drawer dialog's focus handling;
  - a forced-colours outline.
  - Each statement follows from DOM structure or component source (`index.mjs:1105-1115,1264-1272,1302-1316,1351-1353`, `packages/react/src/supplemental/styles.css:2904-2918`). The block browser test asserts them by role, name, and focus (`packages/react/test/browser/pattern-workspace-navigation.test.mjs`, test cases at lines 112-463).
  - Advisory: "complementary landmark", "navigation landmark", "a dialog named Navigation", and "reports aria-expanded" (`artifact.json:61-62,65`) name ARIA roles and states. "Reports" reads closest to an AT-behaviour statement; "sets aria-expanded" would be plainer. None of these claims tested or supported AT behaviour.
  - Advisory: the forced-colours note (`artifact.json:66`) repeats the company-records mechanism note. An emulated forced-colours, computed-style test backs it (`pattern-workspace-navigation.test.mjs:316-340`); it was not checked in a real forced-colours environment. It is not an AT or support claim.
- **Unsupported list and workflow value:** they disclose routing, fold persistence, workspace switching, search, and live counts as placeholders (`artifact.json:68-75`), and they make no claim.

## Cross-block checks

- **Imports vs participants:** every `@muxui/react` import in each of the nine variants is a declared participant of its pattern.
- **Content scan:** the scanner rules ran on all nine variant sources and found zero `content.remote-reference`, `content.local-reference`, or `content.colour-literal` violations. No asset exists, so `content.asset-license` has nothing to check.
- **Claims:** no record or visible prose in any of the seven blocks says "accessible", "tested", "supported", or "compliant", names a screen reader, or cites WCAG. No assistive-technology support claim is made (Decision 0022).
- **Overlap with the source demo:** the new block reuses no distinctive name, email, greeting, date, nav item, or theme from the BeUI sidebar demo. The earlier headings "Companies" (`company-records/examples/react/sortable.tsx:121`) and "Tasks" (`task-filters/examples/react/filter-bar.tsx:101`, `status-buttons.tsx:51`) share generic nouns with that demo's nav items. Those blocks are byte-identical since bb609726, which reviewed them against their own source demo, and both words name the block's own collection, so this is not reuse.
- **Cross-block reuse:** "Sample user" and `sample@example.com` appear in both account-settings and workspace-navigation. "Vendor" still appears in company-records and task-filters. All are Mux-authored generic placeholders, which is acceptable.
- **Advisory, AT wording (carried forward, still present):** these phrases follow from DOM structure rather than from tested support:
  - "hidden from assistive technology" (`catalog/patterns/marketing-hero/artifact.json:37`, `catalog/patterns/pricing-plans/artifact.json:64`);
  - "heading navigation … include it" (`catalog/patterns/pricing-plans/artifact.json:62`). This one is closest to an AT-behaviour statement and could be softened.
- **Advisory, stale-prone notes (carried forward, still true):** the "Mux has no X" style lines go stale once that component or variant is admitted:
  - `catalog/patterns/marketing-hero/artifact.json:44`: Button variants are still primary, neutral, ghost, danger, danger-neutral, danger-ghost, and inverse, with no outlined variant;
  - `catalog/patterns/pricing-plans/artifact.json:69-70`: at e9a470c2, `catalog/components` has 84 entries and still no Badge, and the Card record is unchanged;
  - `catalog/patterns/account-settings/artifact.json:81`: the Switch record is unchanged;
  - the Button, Card, and Switch records are unchanged since 670cb188;
  - new nuance: the workspace navigation block shows count badges through the `badge` prop of `Sidebar.NavItem`, which is a Sidebar part, not a Badge family. "Mux has no Badge" is still true, but beside this block it could read as contradicted. "Mux has no standalone Badge component" would be exact.

## Verdict table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | Imagery | No product, quality, test, or AT claim | Bounded-section test | Verdict |
|---|---|---|---|---|---|---|---|---|
| poster-grid | none | none | yes | yes (`css-grid.tsx:21`) | empty data URI | yes (`artifact.json:69-83`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-78`) | yes | inline SVG (`split.tsx:85`) | yes (`artifact.json:34-46`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | inline SVG (`columns.tsx:164`) | yes, with advisory (`artifact.json:62`) | pass | **Pass** |
| account-settings | none | none | yes (`sections.tsx:4,107-136`) | yes | none | yes (`artifact.json:68-83`) | pass | **Pass** |
| company-records | none | none (teams only, no owner column) | yes, fresh data (`sortable.tsx:6-15,121-131`) | yes | inline SVG (`sortable.tsx:45-49`) | yes, with advisory (`artifact.json:71`) | pass | **Pass** |
| task-filters | none | none (team owners) | yes, fresh data (`filter-bar.tsx:4-15`, `status-buttons.tsx:4-15`) | yes | none | yes (`artifact.json:75-84`) | pass | **Pass** |
| workspace-navigation | none (one Lucide-identical chevron glyph, not a mark) | none ("Sample user", `sample@example.com`) | yes, fresh data (`foldable.tsx:27-52,157-160`) | yes (`#fragment` only, `foldable.tsx:39-48,157`) | inline SVG icons (`foldable.tsx:5-19`) | yes, with advisories (`artifact.json:61-66`) | pass | **Pass** |

## Overall verdict

**Pass.** All seven blocks meet the E-BL1-10 content assertions at `e9a470c2`:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy;
- no external URL or remote asset;
- no literal colour;
- no unlicensed asset;
- the bounded-section test passes for every block.

The new workspace-navigation block's placeholder data is freshly written. It reuses no distinctive name, email, greeting, date, nav item, or theme from the BeUI sidebar demo; its only echoes are generic UI words ("Search", "Inbox") and the common Cmd or Ctrl plus B shortcut. The six earlier blocks are byte-identical to the bb609726 review, and their findings hold.

No actionable failure remains. The advisories above are optional follow-ups and do not block this verdict:

- the `virtualized.tsx:11` title mismatch;
- the unmarked pricing offer copy;
- the AT wording in `pricing-plans`, `marketing-hero`, and `workspace-navigation` ("reports aria-expanded");
- the stale-prone "Mux has no X" lines, including the Badge note beside the Sidebar's count badges;
- the forced-colours notes at `company-records/artifact.json:71` and `workspace-navigation/artifact.json:66`, which emulated tests back but no real forced-colours run does;
- the generic-word echoes "Generic Supply" and "Review the draft outline";
- the Lucide-identical `Switch` chevron glyph in `workspace-navigation/examples/react/foldable.tsx:19`;
- the shared Cmd or Ctrl plus B convention with the source demo;
- workspace-navigation as the block closest to a page shell, whose main pane should stay a placeholder.
