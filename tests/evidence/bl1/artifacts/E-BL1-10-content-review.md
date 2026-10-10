# E-BL1-10 content review record: BL1 blocks after the block copy advisories

**Reviewer:** independent read-only reviewer agent (Claude Opus 5.5), not the authoring agents.
**Source revision:** `c1e5c437c385af91b38f72e04597571bb28be5b2`. Read-only checkout `<home>/Projects/muxui-content-review`, detached at `c1e5c437` (main, PR #261), clean worktree (`git status --short` empty). All line numbers below are at `c1e5c437`.
**Date:** 2026-10-11.

## Method

- **Authority:**
  - Decision 0026 (`decisions/0026-blocks-showcase-admission.md`), as edited in place by Decision 0029: item 2 (category from the registry; lines 48-51), item 6 (block boundary, bounded-section test, demonstration material, content rules; lines 123-152), item 8 growth (lines 184-193), and item 9 evidence with the Decision 0022 carry-over (lines 195-221).
  - Decision 0029 (`decisions/0029-blocks-growth-rules.md`): item 1 (categories are catalog data; lines 47-50), item 6 (content review reuse and its coverage key: block tree, participant component records, and `packages/react/src` apart from the three non-rendering files; lines 116-130), and "What stays protected" (content rules, independent review of new or changed copy, Decision 0022; lines 143-153).
  - Decision 0022 (`decisions/0022-rc1-assistive-technology-non-claim.md`): no assistive-technology support claim.
  - `SCOPE-NONGOAL-008` (`strategy/product-scope.md:162`) and the Roadmap `E-BL1-10` row (`strategy/milestone-roadmap.md:609`). Both moved since the last review because Decision 0027 (#248) and later authority edits shortened those documents.
  - The scanner contract in `packages/catalog/src/pattern-content.mjs:1-58`, unchanged since #228.
- **Block files read:** for each of `catalog/patterns/{poster-grid,marketing-hero,pricing-plans,account-settings,company-records,task-filters,workspace-navigation}`, every variant `.tsx` (nine in all), every `.example.json` (nine), and `artifact.json` (seven), plus `catalog/patterns/categories.json`.
- **Change since the e9a470c2 review, and how it was checked:**
  - `git diff e9a470c2 c1e5c437 -- catalog/patterns` changes six files and adds one:
    - #259 adds `catalog/patterns/categories.json`;
    - #261 edits `poster-grid/examples/react/virtualized.tsx`, and the records `marketing-hero/artifact.json`, `pricing-plans/artifact.json`, `account-settings/artifact.json`, and `workspace-navigation/artifact.json`.
    - Every changed line was read against the e9a470c2 advisory it answers (see Per-block findings). The `company-records` and `task-filters` trees, and the other block files (`css-grid.tsx`, `split.tsx`, `columns.tsx`, `sections.tsx`, `foldable.tsx`, and the poster-grid record), are byte-identical to e9a470c2, so their e9a470c2 findings carry forward. They were still re-read and re-scanned.
  - `git diff e9a470c2 c1e5c437 -- catalog/components` is empty. All 21 participant component records (avatar, breadcrumbs, button, card, form, grid-list, image, link, menu, search-field, select, separator, sidebar, switch, table, tag-group, text, text-field, toggle-button, toggle-button-group, virtualizer) are unchanged. Their copy-bearing fields were read: the string API defaults (only `breadcrumbs` `aria-label: "Breadcrumbs"` and `sidebar` `placeholder: "Search"` carry copy) and their accessibility text, which was grepped for claim words.
  - `git diff e9a470c2 c1e5c437 -- packages/react/src` changes only `generate.mjs` (#250, #256) and `r1-contracts.mjs`. No runtime module, stylesheet, or supplemental mapping changed, so no participant's rendered copy, default label, or placeholder changed. In detail:
    - `r1-contracts.mjs` is one of the three non-rendering files that Decision 0029 item 6 leaves out of the coverage key (`tests/evidence/bl1/capture-support.mjs:245`). Its changes are build-time count and upstream checks.
    - `generate.mjs` drops about 140 lines of drift assertions (they only throw) and derives two values that were literals. The compatibility upstream now comes from `compatibilityUpstream` (`r1-contracts.mjs:30-36`, called at `generate.mjs:354`). The React Aria version in the generated README now comes from `racVersion` (`generate.mjs:17`, used at line 619). At this revision the pin is still `1.20.0` (`packages/react/package.json:79`) and the retained snapshot's upstream is `1.20.0` at the same commit as the old literal (`catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json`). So both outputs equal the e9a470c2 literals, and neither is copy that a block renders.
    - Runtime-owned copy that blocks render, unchanged: "Search" (`packages/react/src/supplemental/index.mjs:1275`), "Toggle sidebar" (`:1272`), "Account options" (`:1319`), the Sidebar drawer labels (`:1352-1353`), and "Clear search" (`packages/react/src/fields.mjs:592`). All are generic.
  - Outside these paths, the range also changes `packages/catalog/src` (#259 category registry, #256 source discovery) and `packages/tokens/src/authoring.mjs` (a named constant for the token contract version). Neither renders block copy.
- **Scans, all seven directories:**
  - `auditPatternAssets` and `patternContentIssues` (`scanPatternContent` plus `scanLocalReferences`) from `packages/catalog/src/pattern-content.mjs` ran read-only from a Node script outside the repository, over all nine variant sources, with each directory's tracked records and sources as its known files. Result: zero content violations, zero asset issues, and an empty licensed set in every directory. Positive controls (a hex colour, a remote `url()`, and `href="/pricing"`) raised `content.colour-literal`, `content.remote-reference`, and `content.local-reference`, so the scan was live.
  - Grep for URLs, `url()`, `@import`, `src=`, `srcSet`, `href`, and asset extensions. The only URL is the SVG-namespace data URI in poster-grid (`css-grid.tsx:21`, `virtualized.tsx:34`). All 15 `href` values are `#fragment`s: 13 in `foldable.tsx:39-48,157` and the two template `#${poster.id}` links (`css-grid.tsx:78`, `virtualized.tsx:96`).
  - Grep for hex colours, colour functions, and common named colours. No literal colour; the only named-colour hits are `white-space: nowrap`.
  - Claim words: accessible, tested, testing, support, compliant, certified, a11y, assistive, screen reader, VoiceOver, NVDA, JAWS, TalkBack, Narrator, WCAG, guarantee. The hits are only:
    - the `accessibility` and `unsupported` field names in all seven records;
    - "supporting text" (`marketing-hero/artifact.json:6`) and the ARIA term "accessible name" (`poster-grid/artifact.json:70`);
    - the placeholder plan features "Community support", "Email support", and "Priority support" (`pricing-plans/examples/react/columns.tsx:7-9`), and the team "Support" (`task-filters`, both variants, line 9).
    - "hidden from assistive technology" no longer appears in any block (#261).
  - Brand and sample-data terms: Acme, Northwind, Contoso, Fabrikam, Initech, Globex, Hooli, Linear, Notion, Slack, GitHub, Figma, Stripe, Twenty, Attio, HubSpot, Salesforce, Apple, Google, Microsoft, Amazon, Netflix, IMDb, Spotify, Airbnb, Uber, Vercel, shadcn, Tailwind, BeUI, Solace, Ava, "lorem ipsum", and common placeholder person names (John, Jane, Doe, Smith). No match in any block.
- **Assets:** no block directory holds any file except its records and variant sources. No asset or `.license.json` exists, and none is required.
- **Limits:** the review did not run the compiler, `pnpm generate`, the test suites, the browser suites, the capture script, or the docs site. That the generated compatibility record and README are unchanged is reasoned from source, not regenerated. Browser test sources were read, not run, where an advisory depends on them. The reviewer has no copy of the source demos; freshness was checked only against the demo data the earlier reviews list, and the copy that could carry it is unchanged since e9a470c2.

## Per-block findings

**Poster grid** (`virtualized.tsx` changed in #261; record and `css-grid.tsx` unchanged)
- Copy is generic: "Sample Title" style titles, plus "Details", "Save", and "Posters" (`catalog/patterns/poster-grid/examples/react/css-grid.tsx:5-18,69,78-79`, `catalog/patterns/poster-grid/examples/react/virtualized.tsx:6-19,87,96-97`).
- Imagery is an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:34`). Links are `#fragment` placeholders.
- Bounded-section test: pass. The only state is the local column count from a ResizeObserver (`virtualized.tsx:39-54`) and GridList's own selection. There is no fetch and no routing.
- Imports match declared participants: Button, GridList, Image, Link, Text, and, in the virtualized variant, Virtualizer (`css-grid.tsx:1`, `virtualized.tsx:2`; `artifact.json:33-64`).
- No claim (`artifact.json:69-82`).
- e9a470c2 advisory, title mismatch: **resolved.** No base title says "Disabled" any more (`virtualized.tsx:6-19`; line 11 is now "A Sample Title That Also Wraps Onto a Second Line"). The card title takes a "Disabled " prefix exactly when `index % 11 === 10` disables the card (`virtualized.tsx:21-31`), so all 90 disabled cards say so and no enabled card does. The comment at line 21 matches the code.
- New advisory, copy polish: because 11 and 12 share no factor, every base title is prefixed somewhere. The four that start with "A" read "Disabled A Sample Title Long Enough…", "Disabled A Sample Title That Also Wraps…", "Disabled A Medium Sample Title", and "Disabled A Last Sample Title" (base titles at `virtualized.tsx:9,11,14,18`). The CSS-grid variant writes the same idea as "A Disabled Sample Title That Also Wraps Onto a Second Line" (`css-grid.tsx:10`). This is generic placeholder copy, not a content-rule breach.

**Marketing hero** (record changed in #261; `split.tsx` unchanged)
- Copy is generic: "Introduce your product", the descriptive line, "Get started", and "See an example" (`catalog/patterns/marketing-hero/examples/react/split.tsx:77-81`).
- The visual is Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:39-58,85-101`), with no initials, text, or mark.
- Bounded-section test: pass. No state, no fetch, no routing.
- Imports match declared participants: Button and Text (`split.tsx:2`; `artifact.json:21-32`).
- e9a470c2 advisory, AT wording: **resolved.** "hidden from assistive technology" now reads "marked aria-hidden" (`catalog/patterns/marketing-hero/artifact.json:37`), a DOM statement that matches `split.tsx:85`.
- e9a470c2 advisory, stale-prone "Mux Button has no outlined variant": **resolved.** The line now reads "An outlined button: the second action uses the neutral Button variant" (`artifact.json:44`) and no longer asserts what Mux lacks. The use of neutral matches `split.tsx:81`.
- No claim (`artifact.json:34-45`).

**Pricing plans** (record changed in #261; `columns.tsx` unchanged)
- Plan names, features, and prices are generic (`catalog/patterns/pricing-plans/examples/react/columns.tsx:6-10`). "Annual saves 20%" (`columns.tsx:141`) agrees with the placeholder prices (20 to 16, 50 to 40).
- Only the local `period` toggle holds state, and the CTAs are inert (`columns.tsx:15,171`).
- Bounded-section test: pass.
- Imports match declared participants: Button, Card, Text, ToggleButton, and ToggleButtonGroup (`columns.tsx:2`; `artifact.json:30-56`).
- e9a470c2 advisory, "heading navigation … include it": **resolved.** It now reads "so the heading text and the group's name include it" (`catalog/patterns/pricing-plans/artifact.json:62`), which follows from the markup (`columns.tsx:146-152`) and describes no AT behaviour.
- e9a470c2 advisory, "hidden from assistive technology": **resolved.** It now reads "decorative SVG marked aria-hidden; each feature is plain text" (`artifact.json:64`), matching `columns.tsx:164-165`.
- e9a470c2 advisory, Badge note: **resolved** with the suggested wording "Mux has no standalone Badge component" (`artifact.json:69`). It is still true: `catalog/components` has 84 entries and no Badge, and the Sidebar's count badge is a `Sidebar.NavItem` prop.
- Advisory (carried forward, still present): "Start free and upgrade when you need more." (`columns.tsx:127`) carries no in-block placeholder marker. The record calls the prices placeholders (`artifact.json:68`), and `SCOPE-NONGOAL-008` covers them, so this is acceptable.
- Advisory (carried forward, still present, low): "Card selected state: Card.Root has none" (`artifact.json:70`) is the one "has none" line #261 left as it was. It is true: `Card.Root` renders a plain `div` with no selected state, while `Card.Button` sets `aria-pressed` (`packages/react/src/supplemental/index.mjs:358-370`). It would go stale only if `Card.Root` gains a selected state.
- "Prices change in place with no live region; add one if you need price changes announced." (`artifact.json:60`) states an absence and gives advice. It claims no AT behaviour.

**Account settings** (record changed in #261; `sections.tsx` unchanged)
- Sample data is "Sample user" and `sample@example.com` (`catalog/patterns/account-settings/examples/react/sections.tsx:4`).
- The form calls `preventDefault` and only moves a local snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists.
- Bounded-section test: pass.
- Imports match declared participants: Button, Form, Select, Separator, Switch, Text, and TextField (`sections.tsx:2`; `artifact.json:30-66`).
- e9a470c2 advisory, stale-prone "the Mux Switch puts its track before its label": **resolved.** It now reads "each Switch shows its track before its label" (`catalog/patterns/account-settings/artifact.json:81`). That describes the participant's layout without a "Mux has no X" assertion. The Switch record is unchanged.
- No claim (`artifact.json:68-82`).

**Company records** (tree byte-identical to e9a470c2)
- The e9a470c2 findings carry forward:
  - placeholder companies built from obvious placeholder words, with real city names, generic tags, and no person or owner column (`catalog/patterns/company-records/examples/react/sortable.tsx:8-15`);
  - one Mux-authored inline SVG (`sortable.tsx:45-49`) and token-only CSS;
  - bounded-section test pass, with local `query`, `sort`, and `selected` state only (`sortable.tsx:33-35`);
  - imports match declared participants: Button, Menu, SearchField, Table, TagGroup, and Text (`sortable.tsx:2`; `artifact.json:31-62`);
  - no AT or support claim (`catalog/patterns/company-records/artifact.json:64-79`).
- Advisory (carried forward, still present): "Generic Supply" (`sortable.tsx:11`) shares the common noun "Supply" with an earlier mock's "Northwind Supply". It is not reuse.
- Advisory (carried forward, still present): the forced-colours note (`artifact.json:71`) is a CSS mechanism note. It is backed by an emulated forced-colours browser test (`packages/react/test/browser/pattern-company-records.test.mjs:270-274`), not by a run in a real forced-colours environment. It is not an AT or support claim.
- New advisory, wording consistency: "report ascending, descending, or none through aria-sort" (`artifact.json:67`) uses the verb that #261 replaced with "sets" in workspace-navigation. "set aria-sort to ascending, descending, or none" would match. It names an ARIA attribute and claims no tested AT behaviour, so it does not fail the block.

**Task filters** (tree byte-identical to e9a470c2)
- The e9a470c2 findings carry forward:
  - the same eight generic office tasks, dates, statuses, and team owners in both variants, with no person's name (`catalog/patterns/task-filters/examples/react/filter-bar.tsx:4-13`, `catalog/patterns/task-filters/examples/react/status-buttons.tsx:4-13`);
  - no imagery;
  - bounded-section test pass, with local `query`, `status`, and `filter` state only (`filter-bar.tsx:28-29`, `status-buttons.tsx:27`);
  - imports match declared participants (`filter-bar.tsx:2`: Button, SearchField, Select, Table, TagGroup, Text; `status-buttons.tsx:2`: Table, Text, ToggleButton, ToggleButtonGroup; `artifact.json:29-70`);
  - no AT or support claim (`catalog/patterns/task-filters/artifact.json:75-89`).
- Advisory (carried forward, still present): "Review the draft outline" (`filter-bar.tsx:6`, `status-buttons.tsx:6`) shares "Review" and "draft" with an earlier mock's "Review the menu draft". It is not reuse.

**Workspace navigation** (record changed in #261; `foldable.tsx` unchanged)
- **Category:** `navigation` is declared in the application group of the registry (`catalog/patterns/categories.json:2`), which Decision 0029 item 1 makes the category authority (`catalog/patterns/workspace-navigation/artifact.json:21`).
- **Placeholder data:** the e9a470c2 findings carry forward, at the same lines of `catalog/patterns/workspace-navigation/examples/react/foldable.tsx`:
  - "Sample workspace", "Example team", and an Avatar fallback initial "S" (lines 27-32, 151);
  - "Sample user" and `sample@example.com` (line 52);
  - the links Inbox (badge "3"), Updates, Saved, Projects, Overview, Roadmap (Now, Next, Later), Reviews (badge "12"), Files, Reports (Weekly, Quarterly), and Settings (lines 39-48);
  - the main pane's breadcrumb, heading "Overview", and "This pane holds your page content." (lines 157-160).
  - No real person, company, or product is named. No distinctive data from the BeUI sidebar demo reappears.
- **Participant-owned copy:** "Search" (`supplemental/index.mjs:1275`), "Toggle sidebar" (`:1272`), "Account options" (`:1319`), and the drawer labels (`:1352-1353`) are unchanged since e9a470c2 and generic. The block overrides the Breadcrumbs default "Breadcrumbs" with "Breadcrumb" (line 157).
- **Imagery:** ten Mux-drawn inline stroke icons from one local factory (`foldable.tsx:5-19`), with `fill="none"`, `stroke="currentColor"`, and `aria-hidden`.
- **Bounded-section test: pass.** One bounded frame holds the navigation column (or its drawer below 40rem) and a placeholder main pane (`foldable.tsx:149-162`). There is no router or route state, every href is a `#fragment`, and the current link is fixed (line 43). The block keeps no state of its own and calls only `useId` (line 57).
- **Imports vs participants:** Avatar, Breadcrumbs, Menu, Sidebar, and Text (line 2) match declared participants (`artifact.json:32-58`).
- e9a470c2 advisory, "reports aria-expanded": **resolved.** It now reads "The fold button sets aria-expanded and controls the column by id" (`artifact.json:62`), which matches the runtime (`supplemental/index.mjs:1272`).
- Advisory (carried forward, no change needed): "complementary landmark", "navigation landmark", and "a dialog named Navigation" (`artifact.json:61,65`) name ARIA roles that follow from DOM structure. They claim no tested or supported AT behaviour.
- Advisory (carried forward, still present): the forced-colours note (`artifact.json:66`) is backed by an emulated forced-colours test (`packages/react/test/browser/pattern-workspace-navigation.test.mjs:316-320`), not by a real forced-colours run. It is not an AT or support claim.
- Advisory (carried forward, still present): the `Switch` icon (`foldable.tsx:19`) has the same geometry as Lucide's `chevrons-up-down`, which the Sidebar account card imports (`supplemental/index.mjs:54`). It is two plain chevrons, ISC-licensed and listed in `packages/react/NOTICE:54-56`, not a mark. Decision 0029 records Andrew's direction that Lucide is Mux UI's default icon set (line 221), which lowers this further. Importing the Lucide icon, or noting that the path follows it, would make the provenance exact.
- Advisory (carried forward, still present): the Cmd or Ctrl plus B fold shortcut (`shortcut="b"`, line 148; `artifact.json:62`) matches the source demo's toggle. It is a common convention and a behaviour, not copy, and the block renders no shortcut hint.
- Advisory (carried forward, still present): of the seven blocks this one is closest to a page shell. It stays one region because the main pane is only a placeholder (`foldable.tsx:154-161`). Filling that pane with page content would move it toward the page templates that item 6 excludes.
- No claim (`artifact.json:60-74`).

## Cross-block checks

- **Categories:** every block's category is declared in `catalog/patterns/categories.json:2-3`: collections (poster-grid, company-records, task-filters), forms (account-settings), navigation (workspace-navigation), hero (marketing-hero), and pricing (pricing-plans).
- **Imports vs participants:** every `@muxui/react` import in each of the nine variants is a declared participant of its pattern, and every participant resolves to a catalog component record that is unchanged since e9a470c2.
- **Content scan:** the scanner rules ran on all nine variant sources and found zero `content.remote-reference`, `content.local-reference`, or `content.colour-literal` violations. No asset exists, so `content.asset-license` has nothing to check.
- **Claims:** no record or visible prose in any of the seven blocks says "accessible" as a quality claim, "tested", "supported", or "compliant", names a screen reader, or cites WCAG. No assistive-technology support claim is made (Decision 0022). #261 removed the remaining "hidden from assistive technology" and "heading navigation" phrasing from the block records.
- **Participant records, outside block content:** the Table component record still says "the sort chevron is decorative and hidden from assistive technology" (`catalog/components/table/artifact.json:1`), and several records use "supported" for API behaviour (for example "Controlled and uncontrolled values are supported"). These are component records, outside the block content rules, unchanged since e9a470c2, and not rendered by any block. They are noted only for completeness.
- **Cross-block reuse:** "Sample user" and `sample@example.com` appear in both account-settings and workspace-navigation. "Vendor" appears in company-records and task-filters. All are Mux-authored generic placeholders, which is acceptable.
- **Overlap with source demos:** "Companies" and "Tasks" (`company-records/examples/react/sortable.tsx:121`, `task-filters/examples/react/filter-bar.tsx:101`, `status-buttons.tsx:51`) share generic nouns with the BeUI sidebar demo's nav items. Both name the block's own collection, and the copy is unchanged since the reviews that cleared it. This is not reuse.
- **Stale-prone notes:** #261 resolved three of the four "Mux has no X" lines. Only `pricing-plans/artifact.json:70` ("Card.Root has none") remains, and it is true at this revision.

## Verdict table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | No literal colour | Imagery | Imports are declared participants | No accessibility, testing, support, or compliance claim | Bounded-section test | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| poster-grid | none | none | yes (`virtualized.tsx:6-31`, `css-grid.tsx:5-18`) | yes (data URI, `#` links) | yes | empty data URI (`css-grid.tsx:21`, `virtualized.tsx:34`) | yes | yes (`artifact.json:69-82`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-81`) | yes | yes | inline SVG (`split.tsx:85-101`) | yes | yes (`artifact.json:34-45`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | yes | inline SVG (`columns.tsx:164`) | yes | yes (`artifact.json:58-71`) | pass | **Pass** |
| account-settings | none | none ("Sample user") | yes (`sections.tsx:4,107-139`) | yes | yes | none | yes | yes (`artifact.json:68-82`) | pass | **Pass** |
| company-records | none | none (no owner column) | yes (`sortable.tsx:8-15,121-131`) | yes | yes | inline SVG (`sortable.tsx:45-49`) | yes | yes, with wording advisory (`artifact.json:67`) | pass | **Pass** |
| task-filters | none | none (team owners) | yes (`filter-bar.tsx:4-15`, `status-buttons.tsx:4-15`) | yes | yes | none | yes | yes (`artifact.json:75-89`) | pass | **Pass** |
| workspace-navigation | none (one Lucide-identical chevron glyph, not a mark) | none ("Sample user", `sample@example.com`) | yes (`foldable.tsx:27-52,157-160`) | yes (`#fragment` only) | yes | inline SVG icons (`foldable.tsx:5-19`) | yes | yes (`artifact.json:60-74`) | pass | **Pass** |

## Overall verdict

**Pass.** All seven blocks meet the E-BL1-10 content assertions at `c1e5c437`:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy, with no distinctive reuse from a source demo;
- no external URL or remote asset;
- no literal colour;
- no unlicensed asset;
- every import is a declared participant;
- the bounded-section test passes for every block;
- no record or visible prose claims accessibility, testing, support, or compliance, names a screen reader, or cites WCAG.

The #261 copy changes are generic and Mux-authored and introduce no claim. The category registry from #259 declares every block's category. No participant component record changed since e9a470c2. The `packages/react/src` changes (`generate.mjs`, `r1-contracts.mjs`) change no runtime module, stylesheet, or mapping, and at this revision they leave every generated value equal to its old literal, so no block renders different copy.

**Resolved by #261:** the virtualized title mismatch (`poster-grid/examples/react/virtualized.tsx:11,21-31`); the AT wording in `marketing-hero/artifact.json:37`, `pricing-plans/artifact.json:62,64`, and `workspace-navigation/artifact.json:62`; and the stale-prone lines in `marketing-hero/artifact.json:44`, `account-settings/artifact.json:81`, and `pricing-plans/artifact.json:69` (Badge).

No failure. The remaining advisories are optional follow-ups and do not block this verdict:

- New: the "Disabled A …" prefix reads awkwardly on titles that start with "A", and the two poster-grid variants phrase disabled titles differently (`virtualized.tsx:9,11,14,18,27`, `css-grid.tsx:10`).
- New: "report … through aria-sort" (`company-records/artifact.json:67`) keeps the verb #261 replaced elsewhere; "set aria-sort" would match.
- Carried: the unmarked pricing offer copy (`pricing-plans/examples/react/columns.tsx:127`).
- Carried, low: the stale-prone "Card.Root has none" (`pricing-plans/artifact.json:70`), true today.
- Carried: the forced-colours notes (`company-records/artifact.json:71`, `workspace-navigation/artifact.json:66`), which emulated tests back but no real forced-colours run does.
- Carried: the generic-word echoes "Generic Supply" and "Review the draft outline".
- Carried: the Lucide-identical `Switch` chevron glyph (`workspace-navigation/examples/react/foldable.tsx:19`).
- Carried: the shared Cmd or Ctrl plus B convention with the source demo.
- Carried: workspace-navigation is the block closest to a page shell, so its main pane should stay a placeholder.
