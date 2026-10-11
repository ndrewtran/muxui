# E-BL1-10 content review record: BL1 blocks after the disabled-title and aria-sort wording fixes

**Reviewer:** independent read-only reviewer agent (Claude Opus 5.5), not the authoring agents.
**Source revision:** `1899324c8aed2d94a6324c4656d2149af5571f39`. Read-only checkout `<home>/Projects/muxui-content-review`, detached at `1899324c` (main, PR #266), clean worktree (`git status --short` empty, `git rev-parse HEAD` equals the revision). All line numbers below are at `1899324c`.
**Date:** 2026-10-11.

## Method

- **Authority** (`git diff c1e5c437 1899324c -- decisions strategy` is empty, so every line cited in the c1e5c437 record still holds):
  - Decision 0026 (`decisions/0026-blocks-showcase-admission.md`), as edited in place by Decision 0029: item 2 (category from the registry; lines 48-51), item 6 (block boundary, bounded-section test, demonstration material, content rules; lines 123-152), item 8 growth (lines 184-193), and item 9 evidence with the Decision 0022 carry-over (lines 195-221).
  - Decision 0029 (`decisions/0029-blocks-growth-rules.md`): item 1 (categories are catalog data; lines 47-50), item 6 (content review reuse and its coverage key: block tree, participant component records, and `packages/react/src` apart from the three non-rendering files listed at `tests/evidence/bl1/capture-support.mjs:245`; lines 116-130), and "What stays protected" (content rules, independent review of new or changed copy, Decision 0022; lines 143-153).
  - Decision 0022 (`decisions/0022-rc1-assistive-technology-non-claim.md`): no assistive-technology support claim.
  - `SCOPE-NONGOAL-008` (`strategy/product-scope.md:162`) and the Roadmap `E-BL1-10` row (`strategy/milestone-roadmap.md:609`).
  - The scanner contract in `packages/catalog/src/pattern-content.mjs:1-58`, unchanged since c1e5c437 (`git diff c1e5c437 1899324c -- packages/catalog/src` is empty).
- **Block files read:** for each of `catalog/patterns/{poster-grid,marketing-hero,pricing-plans,account-settings,company-records,task-filters,workspace-navigation}`, every variant `.tsx` (nine in all), every `.example.json` (nine), and `artifact.json` (seven), plus `catalog/patterns/categories.json`. The pattern tree holds 26 files, exactly these.
- **Change since the c1e5c437 review, and how it was checked** (commits #263, #264, #265, #266):
  - `git diff c1e5c437 1899324c -- catalog/patterns` changes two files, both in #266:
    - `poster-grid/examples/react/virtualized.tsx`: adds a `disabledTitles` pair (lines 21-24), rewrites the comment (line 26), and picks the title from that pair for a disabled card (line 31). The file grows by four lines, so its later line numbers move by four (data URI 34 to 38, `useColumns` 39-54 to 43-58, title 92 to 96, Link 96 to 100).
    - `company-records/artifact.json:67`: "report ascending, descending, or none through aria-sort" becomes "set aria-sort to ascending, descending, or none".
    - Both changed lines were read against the c1e5c437 advisory each answers (see Per-block findings). The other 24 pattern files are byte-identical to c1e5c437; they were still re-read and re-scanned.
  - `git diff c1e5c437 1899324c -- catalog/components` adds one line, `"category": "ai-agent"`, to five component records (#263): `activity`, `code-block`, `data-diff`, `message`, `prompt-composer`. None is a block participant: the seven blocks declare 21 distinct participants (avatar, breadcrumbs, button, card, form, grid-list, image, link, menu, search-field, select, separator, sidebar, switch, table, tag-group, text, text-field, toggle-button, toggle-button-group, virtualizer), and `git diff --quiet c1e5c437 1899324c` over those 21 records is clean. The new field is a docs and Storybook navigation group (`packages/schema/schemas/component.schema.json` `category`, `catalog/AGENTS.md:17-21`, `apps/docs/src/lib/component-categories.ts`); it is not a placeholder, label, or default, and no block renders it. So #263 changes nothing a block renders.
  - `git diff c1e5c437 1899324c -- packages/react/src` is empty. No runtime module, stylesheet, supplemental mapping, or default label changed, so the runtime-owned copy the blocks render is as the c1e5c437 record lists it: "Search", "Toggle sidebar", "Account options", the Sidebar drawer labels, and "Clear search".
  - Outside these paths the range touches docs and Storybook navigation (#263: `apps/component-navigation.mjs`, `apps/docs/src/...`, `apps/react-storybook/src/...`; `apps/docs/src/lib/blocks.ts` changes one comment only), the component schema (#263), browser-test timing helpers (#264: `packages/react/test/browser/grid-list-probes.mjs`, `pattern-poster-grid.test.mjs`, and two GridList/Virtualizer tests; no copy, and no test string names a poster title), retained BL1 evidence (#265), and repository-policy impact tooling. None renders block copy.
- **Scans, all seven directories:**
  - `auditPatternAssets` and `patternContentIssues` (`scanPatternContent` plus `scanLocalReferences`) from `packages/catalog/src/pattern-content.mjs` ran read-only from a temporary Node script outside the repository, over all nine variant sources, with each directory's tracked files as its known files. Result: zero content violations, zero asset issues, and an empty licensed set in every directory. Positive controls (`color: #ff0000`, `url(https://cdn.example.com/a.png)`, and `href="/pricing"`) raised `content.colour-literal`, `content.remote-reference`, and `content.local-reference`, so the scan was live.
  - Grep for URLs, `url()`, `@import`, `src=`, `srcSet`, and `href`. The only URL is the SVG-namespace data URI in poster-grid (`css-grid.tsx:21`, `virtualized.tsx:38`). All 15 `href` values are `#fragment`s: 13 in `foldable.tsx:39-48,157` and the two template `#${poster.id}` links (`css-grid.tsx:78`, `virtualized.tsx:100`).
  - Grep for hex colours, colour functions, and common named colours. No literal colour; the only named-colour hits are `white-space: nowrap` (`sortable.tsx:93`, `filter-bar.tsx:87,98`, `status-buttons.tsx:48`).
  - Claim words: accessible, tested, testing, support, compliant, certified, a11y, assistive, screen reader, VoiceOver, NVDA, JAWS, TalkBack, Narrator, WCAG, guarantee. The hits are only:
    - the `accessibility` and `unsupported` field names in all seven records;
    - "supporting text" (`marketing-hero/artifact.json:6`) and the ARIA term "accessible name" (`poster-grid/artifact.json:70`);
    - the placeholder plan features "Community support", "Email support", and "Priority support" (`pricing-plans/examples/react/columns.tsx:7-9`), and the team "Support" (`task-filters`, both variants, line 9).
  - Brand and sample-data terms: Acme, Northwind, Contoso, Fabrikam, Initech, Globex, Hooli, Linear, Notion, Slack, GitHub, Figma, Stripe, Twenty, Attio, HubSpot, Salesforce, Apple, Google, Microsoft, Amazon, Netflix, IMDb, Spotify, Airbnb, Uber, Vercel, shadcn, Tailwind, BeUI, Solace, Ava, "lorem ipsum", and common placeholder person names (John, Jane, Doe, Smith), as whole words, case-insensitive. No match in any block.
  - The virtualized title rule was evaluated over all 1,000 cards with the source's own arrays and expressions (see Poster grid).
- **Assets:** no block directory holds any file except its records and variant sources (no dotfiles either). No asset or `.license.json` exists, and none is required.
- **Limits:** the review did not run the compiler, `pnpm generate`, the test suites, the browser suites, the capture script, or the docs site. Browser test sources were read, not run, where an advisory depends on them. The reviewer has no copy of the source demos; freshness was checked only against the demo data the earlier reviews list, and the only copy changed since c1e5c437 reuses titles the CSS-grid variant already carried.

## Per-block findings

**Poster grid** (`virtualized.tsx` changed in #266; record and `css-grid.tsx` unchanged)
- Copy is generic: "Sample Title" style titles, plus "Details", "Save", and "Posters" (`catalog/patterns/poster-grid/examples/react/css-grid.tsx:5-18,69,78-79`, `catalog/patterns/poster-grid/examples/react/virtualized.tsx:6-24,91,100-101`).
- Imagery is an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:38`). Links are `#fragment` placeholders.
- Bounded-section test: pass. The only state is the local column count from a ResizeObserver (`virtualized.tsx:43-58`) and GridList's own selection. There is no fetch and no routing.
- Imports match declared participants: Button, GridList, Image, Link, Text, and, in the virtualized variant, Virtualizer (`css-grid.tsx:1`, `virtualized.tsx:2`; `artifact.json:33-64`).
- No claim (`artifact.json:69-82`).
- c1e5c437 advisory, "Disabled A …" prefix and differing phrasing between variants: **resolved.**
  - The disabled card's title now comes from `disabledTitles` (`virtualized.tsx:21-24`): "A Disabled Sample Title That Also Wraps Onto a Second Line" and "Another Disabled Sample Title With Plenty of Words in It". These are character-for-character the two disabled titles of the CSS-grid variant (`css-grid.tsx:10,15`), so both variants now phrase disabled titles the same way, and no "Disabled A …" title remains (no string in the repository outside retained evidence contains "Disabled A ").
  - Title and state agree. `disabled` is `index % 11 === 10` (line 28) and the title is chosen from that same boolean (line 31). Over the 1,000 cards, 90 are disabled (cards 11, 22, 33, …), every one carries a title containing "Disabled", and no enabled card does: the base `titles` array (lines 6-19) contains no "Disabled". `Math.floor(index / 11) % 2` alternates the pair, 45 cards each.
  - The comment "Every 11th card is disabled and says so in its title, alternating the two disabled titles." (line 26) matches the code.
  - The enabled base titles at lines 11 and 16 are the disabled titles without "Disabled", which keeps the wrap lengths of the CSS-grid variant. This is generic placeholder copy.

**Marketing hero** (tree byte-identical to c1e5c437)
- Copy is generic: "Introduce your product", the descriptive line, "Get started", and "See an example" (`catalog/patterns/marketing-hero/examples/react/split.tsx:77-81`).
- The visual is Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:39-58,85-101`), with no initials, text, or mark.
- Bounded-section test: pass. No state, no fetch, no routing.
- Imports match declared participants: Button and Text (`split.tsx:2`; `artifact.json:21-32`).
- "marked aria-hidden" (`catalog/patterns/marketing-hero/artifact.json:37`) and the neutral-variant line (`artifact.json:44`) stand as #261 left them and as the c1e5c437 record cleared them.
- No claim (`artifact.json:34-45`).

**Pricing plans** (tree byte-identical to c1e5c437)
- Plan names, features, and prices are generic (`catalog/patterns/pricing-plans/examples/react/columns.tsx:6-10`). "Annual saves 20%" (`columns.tsx:141`) agrees with the placeholder prices (20 to 16, 50 to 40).
- Only the local `period` toggle holds state, and the CTAs are inert (`columns.tsx:15,171`).
- Bounded-section test: pass.
- Imports match declared participants: Button, Card, Text, ToggleButton, and ToggleButtonGroup (`columns.tsx:2`; `artifact.json:30-56`).
- No claim (`catalog/patterns/pricing-plans/artifact.json:58-71`). "Prices change in place with no live region; add one if you need price changes announced." (`artifact.json:60`) states an absence and gives advice; it claims no AT behaviour.
- Advisory (carried forward, still present): "Start free and upgrade when you need more." (`columns.tsx:127`) carries no in-block placeholder marker. The record calls the prices placeholders (`artifact.json:68`), and `SCOPE-NONGOAL-008` covers them, so this is acceptable.
- Advisory (carried forward, still present, low): "Card selected state: Card.Root has none" (`artifact.json:70`). It is true: `packages/react/src` is unchanged since c1e5c437, where `Card.Root` renders a plain `div` with no selected state. It would go stale only if `Card.Root` gains one.

**Account settings** (tree byte-identical to c1e5c437)
- Sample data is "Sample user" and `sample@example.com` (`catalog/patterns/account-settings/examples/react/sections.tsx:4`).
- The form calls `preventDefault` and only moves a local snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists.
- Bounded-section test: pass.
- Imports match declared participants: Button, Form, Select, Separator, Switch, Text, and TextField (`sections.tsx:2`; `artifact.json:30-66`).
- No claim (`catalog/patterns/account-settings/artifact.json:68-82`).

**Company records** (record changed in #266; `sortable.tsx` unchanged)
- Placeholder companies built from obvious placeholder words, with real city names, generic tags, and no person or owner column (`catalog/patterns/company-records/examples/react/sortable.tsx:8-15`).
- One Mux-authored inline SVG (`sortable.tsx:45-49`) and token-only CSS.
- Bounded-section test: pass, with local `query`, `sort`, and `selected` state only (`sortable.tsx:33-35`).
- Imports match declared participants: Button, Menu, SearchField, Table, TagGroup, and Text (`sortable.tsx:2`; `artifact.json:31-62`).
- c1e5c437 advisory, aria-sort verb: **resolved.** The line now reads "Sortable column headers sort on click, Enter, or Space, and set aria-sort to ascending, descending, or none." (`catalog/patterns/company-records/artifact.json:67`), the suggested wording. It matches "sets aria-expanded" in `workspace-navigation/artifact.json:62`, names an ARIA attribute, and claims no AT behaviour.
- No claim (`artifact.json:64-79`).
- Advisory (carried forward, still present): "Generic Supply" (`sortable.tsx:11`) shares the common noun "Supply" with an earlier mock's "Northwind Supply". It is not reuse.
- Advisory (carried forward, still present): the forced-colours note (`artifact.json:71`) is a CSS mechanism note, backed by an emulated forced-colours browser test (`packages/react/test/browser/pattern-company-records.test.mjs`, unchanged since c1e5c437), not by a run in a real forced-colours environment. It is not an AT or support claim.

**Task filters** (tree byte-identical to c1e5c437)
- The same eight generic office tasks, dates, statuses, and team owners in both variants, with no person's name (`catalog/patterns/task-filters/examples/react/filter-bar.tsx:4-13`, `catalog/patterns/task-filters/examples/react/status-buttons.tsx:4-13`).
- No imagery.
- Bounded-section test: pass, with local `query`, `status`, and `filter` state only (`filter-bar.tsx:28-29`, `status-buttons.tsx:27`).
- Imports match declared participants (`filter-bar.tsx:2`: Button, SearchField, Select, Table, TagGroup, Text; `status-buttons.tsx:2`: Table, Text, ToggleButton, ToggleButtonGroup; `artifact.json:29-70`).
- No claim (`catalog/patterns/task-filters/artifact.json:75-89`).
- Advisory (carried forward, still present): "Review the draft outline" (`filter-bar.tsx:6`, `status-buttons.tsx:6`) shares "Review" and "draft" with an earlier mock's "Review the menu draft". It is not reuse.

**Workspace navigation** (tree byte-identical to c1e5c437)
- **Category:** `navigation` is declared in the application group of the registry (`catalog/patterns/categories.json:2`; `catalog/patterns/workspace-navigation/artifact.json:21`).
- **Placeholder data** (`catalog/patterns/workspace-navigation/examples/react/foldable.tsx`): "Sample workspace", "Example team", and an Avatar fallback initial "S" (lines 27-32, 151); "Sample user" and `sample@example.com` (line 52); the links Inbox (badge "3"), Updates, Saved, Projects, Overview, Roadmap (Now, Next, Later), Reviews (badge "12"), Files, Reports (Weekly, Quarterly), and Settings (lines 39-48); the main pane's breadcrumb, heading "Overview", and "This pane holds your page content." (lines 157-160). No real person, company, or product is named, and no distinctive data from the BeUI sidebar demo reappears.
- **Participant-owned copy:** unchanged, since `packages/react/src` and the Sidebar, Menu, Avatar, Breadcrumbs, and Text records are unchanged since c1e5c437. The block overrides the Breadcrumbs default "Breadcrumbs" with "Breadcrumb" (line 157).
- **Imagery:** ten Mux-drawn inline stroke icons from one local factory (`foldable.tsx:5-19`), with `fill="none"`, `stroke="currentColor"`, and `aria-hidden`.
- **Bounded-section test: pass.** One bounded frame holds the navigation column (or its drawer below 40rem) and a placeholder main pane (`foldable.tsx:149-162`). There is no router or route state, every href is a `#fragment`, and the current link is fixed (line 43). The block keeps no state of its own and calls only `useId` (line 57).
- **Imports vs participants:** Avatar, Breadcrumbs, Menu, Sidebar, and Text (line 2) match declared participants (`artifact.json:32-58`).
- No claim (`artifact.json:60-74`).
- Advisory (carried forward, no change needed): "complementary landmark", "navigation landmark", and "a dialog named Navigation" (`artifact.json:61,65`) name ARIA roles that follow from DOM structure. They claim no tested or supported AT behaviour.
- Advisory (carried forward, still present): the forced-colours note (`artifact.json:66`) is backed by an emulated forced-colours test (`packages/react/test/browser/pattern-workspace-navigation.test.mjs`, unchanged since c1e5c437), not by a real forced-colours run. It is not an AT or support claim.
- Advisory (carried forward, still present): the `Switch` icon (`foldable.tsx:19`) has the same geometry as Lucide's `chevrons-up-down`. It is two plain chevrons, ISC-licensed and listed in `packages/react/NOTICE`, not a mark, and Decision 0029 records Lucide as Mux UI's default icon set. Importing the Lucide icon, or noting that the path follows it, would make the provenance exact.
- Advisory (carried forward, still present): the Cmd or Ctrl plus B fold shortcut (`shortcut="b"`, line 148; `artifact.json:62`) matches the source demo's toggle. It is a common convention and a behaviour, not copy, and the block renders no shortcut hint.
- Advisory (carried forward, still present): of the seven blocks this one is closest to a page shell. It stays one region because the main pane is only a placeholder (`foldable.tsx:154-161`). Filling that pane with page content would move it toward the page templates that item 6 excludes.

## Cross-block checks

- **Categories:** `catalog/patterns/categories.json` is unchanged since c1e5c437. Every block's category is declared there (lines 2-3): collections (poster-grid, company-records, task-filters), forms (account-settings), navigation (workspace-navigation), hero (marketing-hero), and pricing (pricing-plans). The new component-record `category` (#263) is a separate, component-only field and does not touch the block registry.
- **Imports vs participants:** every `@muxui/react` import in each of the nine variants is a declared participant of its pattern, and every participant resolves to one of 21 component records, all unchanged since c1e5c437.
- **Content scan:** the scanner rules ran on all nine variant sources and found zero `content.remote-reference`, `content.local-reference`, or `content.colour-literal` violations. No asset exists, so `content.asset-license` has nothing to check.
- **Claims:** no record or visible prose in any of the seven blocks says "accessible" as a quality claim, "tested", "supported", or "compliant", names a screen reader, or cites WCAG. No assistive-technology support claim is made (Decision 0022). The two #266 lines add no claim.
- **Coverage key (Decision 0029 item 6):** since c1e5c437 the block trees of poster-grid and company-records changed, so the retained c1e5c437 review no longer covers them; this record re-reviews all seven. No participant record and no `packages/react/src` file changed, so no other block's coverage key moved.
- **Participant records, outside block content:** the Table component record still says "the sort chevron is decorative and hidden from assistive technology" (`catalog/components/table/artifact.json:1`), the Sidebar record says "Toggle keeps one accessible name, reports aria-expanded" (`catalog/components/sidebar/artifact.json:46,125`), and several records use "supported" for API behaviour. These are component records, outside the block content rules, unchanged since c1e5c437, and not rendered by any block. They are noted only for completeness.
- **Cross-block reuse:** "Sample user" and `sample@example.com` appear in both account-settings and workspace-navigation. "Vendor" appears in company-records and task-filters. The two disabled poster titles now appear in both poster-grid variants, by design. All are Mux-authored generic placeholders, which is acceptable.
- **Overlap with source demos:** "Companies" and "Tasks" (`company-records/examples/react/sortable.tsx:121`, `task-filters/examples/react/filter-bar.tsx:101`, `status-buttons.tsx:51`) share generic nouns with the BeUI sidebar demo's nav items. Both name the block's own collection, and the copy is unchanged since the reviews that cleared it. This is not reuse.
- **Stale-prone notes:** only `pricing-plans/artifact.json:70` ("Card.Root has none") remains, and it is true at this revision.

## Verdict table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | No literal colour | Imagery | Imports are declared participants | No accessibility, testing, support, or compliance claim | Bounded-section test | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| poster-grid | none | none | yes (`virtualized.tsx:6-31`, `css-grid.tsx:5-18`) | yes (data URI, `#` links) | yes | empty data URI (`css-grid.tsx:21`, `virtualized.tsx:38`) | yes | yes (`artifact.json:69-82`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-81`) | yes | yes | inline SVG (`split.tsx:85-101`) | yes | yes (`artifact.json:34-45`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | yes | inline SVG (`columns.tsx:164`) | yes | yes (`artifact.json:58-71`) | pass | **Pass** |
| account-settings | none | none ("Sample user") | yes (`sections.tsx:4,107-139`) | yes | yes | none | yes | yes (`artifact.json:68-82`) | pass | **Pass** |
| company-records | none | none (no owner column) | yes (`sortable.tsx:8-15,121-131`) | yes | yes | inline SVG (`sortable.tsx:45-49`) | yes | yes (`artifact.json:64-79`) | pass | **Pass** |
| task-filters | none | none (team owners) | yes (`filter-bar.tsx:4-15`, `status-buttons.tsx:4-15`) | yes | yes | none | yes | yes (`artifact.json:75-89`) | pass | **Pass** |
| workspace-navigation | none (one Lucide-identical chevron glyph, not a mark) | none ("Sample user", `sample@example.com`) | yes (`foldable.tsx:27-52,157-160`) | yes (`#fragment` only) | yes | inline SVG icons (`foldable.tsx:5-19`) | yes | yes (`artifact.json:60-74`) | pass | **Pass** |

## Overall verdict

**Pass.** All seven blocks meet the E-BL1-10 content assertions at `1899324c`:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy, with no distinctive reuse from a source demo;
- no external URL or remote asset;
- no literal colour;
- no unlicensed asset;
- every import is a declared participant;
- the bounded-section test passes for every block;
- no record or visible prose claims accessibility, testing, support, or compliance, names a screen reader, or cites WCAG.

The #266 copy changes are generic and Mux-authored and introduce no claim. The virtualized disabled titles agree with the disabled cards (90 of 1,000, each titled "Disabled", no enabled card so titled), the comment matches the code, and the titles match the CSS-grid variant word for word. #263's `category` field lands on five component records that no block uses and is navigation metadata, not rendered copy. `packages/react/src` is unchanged since c1e5c437, so no participant's default placeholder or label changed.

**Resolved by #266:** the "Disabled A …" phrasing and the differing disabled-title phrasing between the poster-grid variants (`poster-grid/examples/react/virtualized.tsx:21-31`, matching `css-grid.tsx:10,15`); and the "report … through aria-sort" verb (`company-records/artifact.json:67`).

No failure. The remaining advisories are optional follow-ups and do not block this verdict:

- Carried: the unmarked pricing offer copy (`pricing-plans/examples/react/columns.tsx:127`).
- Carried, low: the stale-prone "Card.Root has none" (`pricing-plans/artifact.json:70`), true today.
- Carried: the forced-colours notes (`company-records/artifact.json:71`, `workspace-navigation/artifact.json:66`), which emulated tests back but no real forced-colours run does.
- Carried: the generic-word echoes "Generic Supply" and "Review the draft outline".
- Carried: the Lucide-identical `Switch` chevron glyph (`workspace-navigation/examples/react/foldable.tsx:19`).
- Carried: the shared Cmd or Ctrl plus B convention with the source demo.
- Carried: workspace-navigation is the block closest to a page shell, so its main pane should stay a placeholder.
