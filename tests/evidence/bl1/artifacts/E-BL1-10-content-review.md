# E-BL1-10 content review record: BL1 blocks after growth

**Reviewer:** independent read-only reviewer agent (Claude Opus 5.5), not the authoring agents.
**Source revision:** `bb6097269c3a2683e8680d0d7be9a83b4f069958`. Primary checkout on `main` at `bb609726` (PR #238), clean worktree (`git status --short` empty).
**Date:** 2026-10-10.

## Method

- **Authority:**
  - Decision 0026: item 6 (block boundary, bounded-section test, content rules), item 8 (growth), and item 9 (evidence, Decision 0022 carry-over).
  - Decision 0026 amendments 01 (page-width presets) and 02 (category-name queries). Neither changes a content rule.
  - `SCOPE-NONGOAL-008` in `strategy/product-scope.md:272`, Decision 0022, and the Roadmap `E-BL1-10` row (`strategy/milestone-roadmap.md:1311`).
  - The scanner contract in `packages/catalog/src/pattern-content.mjs:1-58`.
- **Block files:** for each of `catalog/patterns/{poster-grid,marketing-hero,pricing-plans,account-settings,company-records,task-filters}`, every variant `.tsx`, every `.example.json`, and `artifact.json`.
- **Change since the last review:** `git diff 670cb188 bb609726 -- catalog/patterns/` touches only the two new blocks (8 files added). The four earlier blocks are byte-identical to the 670cb188 review, so their findings carry forward. They were re-scanned, and their advisories were re-checked against the current tree.
- **Scans, all six directories:**
  - `scanPatternContent` and `scanLocalReferences` from `packages/catalog/src/pattern-content.mjs` were run directly on all eight variant sources, read-only, with an empty licensed set. Result: zero violations in every file.
  - Grep for URLs, `url()`, `@import`, `href`, `src=`, and asset extensions. The only match is the SVG-namespace data URI already passed in poster-grid (`css-grid.tsx:21`, `virtualized.tsx:29`). The new blocks have no `href` or `src`.
  - Grep for hex colours, colour functions, and common named colours. No literal colour; the only hits are `white-space: nowrap`.
  - Claim words: accessible, tested, supported, compliant, screen reader, VoiceOver, NVDA, JAWS, TalkBack, WCAG, guarantee. No claim. The only hits are the `accessibility` and `unsupported` field names and the team name "Support" (`task-filters/examples/react/filter-bar.tsx:9`).
  - Brand and source-demo terms: the brief's gelato categories, task fragments, advisors, mock company names, and sample-data brands (Northwind, Contoso, Acme, Fabrikam, and similar). No match in either new block. The only hits are the `Menu` component and the word "menu" in its row-menu copy, which is unrelated to the demo's food menu.
  - Demo dates (Dec 03, Sep 22, Jan 02, Nov 08, Apr 14) in either month-day or ISO form. No match.
- **Assets:** neither new block directory holds any file except its records and variant sources. No asset or `.license.json` exists in any of the six blocks, and none is required.
- **Limits:** the review did not run the compiler, the test suites, the browser suites, the capture script, or the docs site. The scanner functions were run on their own. Relationship levels and statuses were compared only against the demo data the brief lists, because the reviewer has no copy of the Beautiful UI demo.

## Per-block findings

**Poster grid** (unchanged since 670cb188)
- Copy is generic: "Sample Title" style titles, plus "Details", "Save", and "Posters" (`catalog/patterns/poster-grid/examples/react/css-grid.tsx:5-18`, `catalog/patterns/poster-grid/examples/react/virtualized.tsx:6-19`).
- Imagery is an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:29`). Links are `#fragment` placeholders.
- Bounded-section test: pass. Only local column state is kept, and there is no fetch and no routing.
- Advisory: `catalog/patterns/poster-grid/examples/react/virtualized.tsx:11` still titles a card "A Disabled Sample Title…" while only `index % 11 === 10` is disabled (`virtualized.tsx:25`). This is misleading demonstration copy, not a content-rule breach.

**Marketing hero** (unchanged since 670cb188)
- Copy is generic: "Introduce your product", the descriptive line, "Get started", and "See an example" (`catalog/patterns/marketing-hero/examples/react/split.tsx:77-78`).
- The visual is Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:85-101`), with no initials, text, or mark.
- Bounded-section test: pass.

**Pricing plans** (unchanged since 670cb188)
- Plan names, features, and prices are generic (`catalog/patterns/pricing-plans/examples/react/columns.tsx:6-10`).
- Only the local `period` toggle holds state, and the CTAs are inert.
- Bounded-section test: pass.
- Advisory: "Start free and upgrade when you need more" (`catalog/patterns/pricing-plans/examples/react/columns.tsx:127`) carries no in-block placeholder marker. The record calls the prices placeholders, and `SCOPE-NONGOAL-008` covers them, so this is acceptable.

**Account settings** (unchanged since 670cb188)
- Sample data is "Sample user" and `sample@example.com` (`catalog/patterns/account-settings/examples/react/sections.tsx:4`).
- The form calls `preventDefault` and only moves a local snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists.
- Bounded-section test: pass.

**Company records** (new, Collections)
- **Placeholder data**, `catalog/patterns/company-records/examples/react/sortable.tsx:6-15`:
  - Company names: Demo Partners, Example Holdings, Generic Supply, Placeholder Studio, Sample Company, Sample Logistics. Each is built from an obvious placeholder word, and none is a known brand or sample-data brand.
  - Cities: Lisbon, Osaka, Nairobi, Denver, Hobart, Gdansk. These are real place names, not brands or people.
  - Tags: Partner, Priority, Vendor, Trial, Regional.
  - Relationship levels: Dormant, New, Developing, Established.
  - Last-contact dates: 2026-03-02, 2025-11-19, 2026-04-21, 2026-01-08, 2026-05-06, 2025-09-30.
  - No person or owner column appears.
- **Freshness against the source demo and the earlier mock:**
  - No company name repeats one from the mock (Copperfield Trading, Harbor & Pine, Northwind Supply, Lakeside Provisions, Meridian Pantry, Summit Goods).
  - No tag repeats a gelato category (B2B, Gelato, Wholesale, Catering, Seasonal, Sorbet, Imports, Dairy-free, B2C, Vegan, Cafe).
  - No date matches Dec 03, Sep 22, Jan 02, Nov 08, or Apr 14 by month and day.
  - The theme is a generic business directory, with no food, shop, or gelato content.
  - Advisory: "Generic Supply" (`sortable.tsx:11`) shares the common noun "Supply" with the mock's "Northwind Supply". The name, its other word, and the theme are new, so this is not reuse. A different noun would remove even that echo.
- **Copy:** "Companies", "Search companies", "{n} selected", "Add to list", "No companies match this search", and the menu items "Open", "Add note", and "Archive" (`sortable.tsx:52,121-131`). It is generic and Mux-authored, and makes no product or quality claim.
- **Imagery:** one Mux-authored inline SVG (three dots, `fill="currentColor"`, `aria-hidden`; `sortable.tsx:45-49`). Block CSS uses only `--muxui-semantic-*` tokens, `transparent`, and `currentColor` (`sortable.tsx:61-119`).
- **Bounded-section test: pass.**
  - It is one `section` region, and it has no routing, link, fetch, submission, or persistence.
  - State is local presentation only: `query`, `sort`, and `selected` (`sortable.tsx:32-35`), as the source comment states.
  - "Add to list" has no handler (`sortable.tsx:125`), and the menu items have none, which the record discloses (`catalog/patterns/company-records/artifact.json:79`). The rows are disclosed as placeholders (`artifact.json:75`).
- **Imports vs participants:** Button, Menu, SearchField, Table, TagGroup, and Text (`sortable.tsx:2`) all match declared participants (`catalog/patterns/company-records/artifact.json:31-62`). The category is the existing Collections (`artifact.json:20`).
- **Claims:** the accessibility notes (`artifact.json:64-73`) describe names, keys, ARIA attributes, the status role, and layout. They make no "accessible", "tested", "supported", or assistive-technology claim (Decision 0022).
  - Advisory: `catalog/patterns/company-records/artifact.json:71` says the transparent outline "still shows where forced colors drop the shadow". This states rendering behaviour in forced-colours mode that BL1 evidence does not capture. It is a CSS mechanism note, not an AT or support claim, so it does not block.

**Task filters** (new, Collections)
- **Placeholder data:** the same eight rows appear in both variants (`catalog/patterns/task-filters/examples/react/filter-bar.tsx:4-13`, `catalog/patterns/task-filters/examples/react/status-buttons.tsx:4-13`).
  - Tasks: "Update the onboarding checklist", "Review the draft outline", "Schedule the quarterly check-in", "Archive last year files", "Prepare the release notes", "Confirm the vendor list", "Draft the planning agenda", and "Close the open questions".
  - Dates: 2026-02-11, 2026-03-04, 2026-03-18, 2026-01-27, 2026-04-02, 2026-02-25, 2026-04-15, 2026-03-30.
  - Statuses: To do, In progress, Done.
  - Owners are teams: Operations, Editorial, Planning team, Support, and Review board. No person's name appears.
- **Freshness against the source demo and the earlier mock:**
  - No task repeats a demo task (restock mango, churn black sesame, print summer menu, taste-test batch 42, order waffle cones) or a mock task (Restock supplies, Review the menu draft, Print the summer menu, Test menu batch 42, Order packaging).
  - No owner repeats a demo advisor (Mango Mo…, Kumo Cre…, Coral Coa…, Maple Orbit, Aurora Sc…).
  - No date matches a demo date by month and day. The nearest is 2026-04-15 against Apr 14.
  - The theme is generic office work, with no food, menu, or shop content.
  - Advisory: "Review the draft outline" (`filter-bar.tsx:6`, `status-buttons.tsx:6`) shares the verb "Review" and the word "draft" with the mock's "Review the menu draft". The object and the theme differ, and both words are generic, so this is not reuse. Rewording it, for example to "Check the outline", would remove the echo.
- **Copy:** "Tasks", "Search tasks", "Any status", "Clear filters", "Task: {query}", "Status: {status}", "{n} of {m} tasks", "No tasks match these filters", and "Filter by status" with counts (`filter-bar.tsx:15,101-114`, `status-buttons.tsx:15,51-58`). It is generic and Mux-authored, with no claim.
- **Imagery:** none. Block CSS uses only semantic layout tokens and plain lengths (`filter-bar.tsx:45-100`, `status-buttons.tsx:32-50`).
- **Bounded-section test: pass.**
  - Each variant is one `section` region, with no routing, link, fetch, submission, or persistence.
  - State is local presentation only: `query` and `status` in the filter bar (`filter-bar.tsx:27-29`), and `filter` in the status buttons (`status-buttons.tsx:26-27`).
  - "Clear filters" resets local state and moves focus (`filter-bar.tsx:37-41`). The record discloses placeholder rows and component-only state (`catalog/patterns/task-filters/artifact.json:86,89`).
- **Imports vs participants:**
  - The filter bar uses Button, SearchField, Select, Table, TagGroup, and Text (`filter-bar.tsx:2`).
  - The status buttons use Table, Text, ToggleButton, and ToggleButtonGroup (`status-buttons.tsx:2`).
  - All of them are declared participants (`catalog/patterns/task-filters/artifact.json:29-70`). The category is the existing Collections (`artifact.json:18`).
- **Claims:** the accessibility notes (`artifact.json:75-84`) describe names, keys, focus moves, status regions, and layout. They make no "accessible", "tested", "supported", or assistive-technology claim (Decision 0022).

## Cross-block checks

- **Imports vs participants:** every `@muxui/react` import in each of the eight variants is a declared participant of its pattern.
- **Content scan:** the scanner rules ran on all eight variant sources and found zero `content.remote-reference`, `content.local-reference`, or `content.colour-literal` violations. No asset exists, so `content.asset-license` has nothing to check.
- **Claims:** no record or visible prose in any of the six blocks says "accessible", "tested", "supported", or "compliant", names a screen reader, or cites WCAG. No assistive-technology support claim is made (Decision 0022).
- **Overlap with the source demo:** no name, task, date, tag, advisor, or theme is reused in either new block. The only lexical echoes are the two generic-word advisories above ("Generic Supply", "Review the draft outline").
- **Cross-block reuse:** "Vendor" appears as a company-records tag and in the task "Confirm the vendor list". Both are Mux-authored and generic, which is acceptable.
- **Advisory, AT wording (carried forward, still present):** these phrases follow from DOM structure rather than from tested support:
  - "hidden from assistive technology" (`catalog/patterns/marketing-hero/artifact.json:37`, `catalog/patterns/pricing-plans/artifact.json:64`);
  - "heading navigation … include it" (`catalog/patterns/pricing-plans/artifact.json:62`). This one is closest to an AT-behaviour statement and could be softened.
- **Advisory, stale-prone notes (carried forward, still true):** the "Mux has no X" style lines go stale once that component or variant is admitted:
  - `catalog/patterns/marketing-hero/artifact.json:44`, `catalog/patterns/pricing-plans/artifact.json:69-70`, `catalog/patterns/account-settings/artifact.json:81`;
  - at bb609726 `catalog/components` still has no Badge;
  - the Button, Card, and Switch records are unchanged since 670cb188.

## Verdict table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | Imagery | No product, quality, test, or AT claim | Bounded-section test | Verdict |
|---|---|---|---|---|---|---|---|---|
| poster-grid | none | none | yes | yes (`css-grid.tsx:21`) | empty data URI | yes (`artifact.json:69-83`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-78`) | yes | inline SVG (`split.tsx:85`) | yes (`artifact.json:34-46`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | inline SVG (`columns.tsx:164`) | yes, with advisory (`artifact.json:62`) | pass | **Pass** |
| account-settings | none | none | yes (`sections.tsx:4,107-136`) | yes | none | yes (`artifact.json:68-83`) | pass | **Pass** |
| company-records | none | none (teams only, no owner column) | yes, fresh data (`sortable.tsx:6-15,121-131`) | yes | inline SVG (`sortable.tsx:45-49`) | yes, with advisory (`artifact.json:71`) | pass | **Pass** |
| task-filters | none | none (team owners) | yes, fresh data (`filter-bar.tsx:4-15`, `status-buttons.tsx:4-15`) | yes | none | yes (`artifact.json:75-84`) | pass | **Pass** |

## Overall verdict

**Pass.** All six blocks meet the E-BL1-10 content assertions at `bb609726`:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy;
- no external URL or remote asset;
- no literal colour;
- no unlicensed asset;
- the bounded-section test passes for every block.

The two new blocks' placeholder data is freshly written and reuses no name, task, date, tag, advisor, or theme from the source demo or the earlier mock.

No actionable failure remains. The advisories above are optional follow-ups and do not block this verdict:

- the `virtualized.tsx:11` title mismatch;
- the unmarked pricing offer copy;
- the AT wording in `pricing-plans` and `marketing-hero`;
- the stale-prone "Mux has no X" lines;
- the forced-colours note at `company-records/artifact.json:71`;
- the generic-word echoes "Generic Supply" and "Review the draft outline".
