# E-BL1-10 content review record: all fourteen BL1 blocks after the fresh sample copy of #288

**Reviewer:** independent read-only reviewer agent (Claude Opus 5.5), a separate agent that neither authored the blocks (Sonnet coder agents did) nor reviewed their code (GPT-6.1-Sol did).
**Source revision:** `c9ae806796ab0eaa1e6c477d92adab43da7ed9f3`, a main commit: the squash of #288, contained in `origin/main`. Read-only checkout `<home>/Projects/muxui-content-review`, detached at `c9ae8067`. The worktree is clean: `git status --short` is empty and `git rev-parse HEAD` equals the revision, both before and after the review. All line numbers below are at `c9ae8067`.
**Date:** 2026-10-12.

## Method

- **Authority.**
  - **Unchanged authorities.** `git diff 1899324c c9ae8067` is empty over Decisions 0022, 0026, and 0029, and over `packages/catalog/src/pattern-content.mjs`.
  - **Changes in the range.**
    - The range adds Decisions 0030 and 0031. Decision 0031 states that Decisions 0026 and 0029 "stay as written" (`decisions/0031-react-owns-api-and-css-and-parks-scaffolds.md:300`).
    - #285 widened the import rule in `packages/catalog/src/pattern-imports.mjs` to exactly one subpath, `@muxui/react/markdown`, beside `@muxui/react`. Both are allowed only as static named imports (lines 39-40).
    - #288 changes no authority, scanner, or runtime file: `git diff 1873d105 c9ae8067` is empty over `decisions`, `strategy`, `packages/catalog/src`, `packages/react/src`, `tests/evidence/bl1/README.md`, and `tests/evidence/bl1/capture-support.mjs`.
  - **Decision 0026** (`decisions/0026-blocks-showcase-admission.md`), as edited in place by Decision 0029:
    - item 2, category from the registry (lines 48-51);
    - item 6, block boundary, bounded-section test, demonstration material, and content rules (lines 123-152);
    - item 8, growth (lines 184-193);
    - item 9, evidence and the Decision 0022 carry-over (lines 195-221).
  - **Decision 0029** (`decisions/0029-blocks-growth-rules.md`):
    - item 1, categories are catalog data (lines 47-50);
    - item 6, content review reuse and its coverage key (lines 116-130); the non-rendering runtime files are listed at `tests/evidence/bl1/capture-support.mjs:300`;
    - "What stays protected" (lines 143-153).
  - **Decision 0022** (`decisions/0022-rc1-assistive-technology-non-claim.md`): no assistive-technology support claim.
  - **Scope and Roadmap.** `SCOPE-NONGOAL-008` is at `strategy/product-scope.md:162`. The Roadmap `E-BL1-10` row is at `strategy/milestone-roadmap.md:622`; its text is byte-identical to the row the `1899324c` record cited at line 609.
  - **Scanner contract:** `packages/catalog/src/pattern-content.mjs:1-58`.
  - **Evidence README:** `tests/evidence/bl1/README.md`, sections "Independent reviews" (lines 234-266) and "Adding a block" (from line 302).
- **Block files read.** I read every file in `catalog/patterns` at `c9ae8067`: 55 files in all. That is the whole tracked tree, and the working tree matches it with no untracked file and no dotfile. The 55 files are:
  - 14 `artifact.json`;
  - 20 variant `.tsx` and their 20 `.example.json`;
  - `categories.json`.

  The variants are:
  - account-settings: sections
  - agent-trace: thinking, tool-calls, task-rows
  - approval-request: question-stepper
  - chat-panel: tabbed-thread
  - company-records: sortable
  - context-sources: excerpts
  - marketing-hero: split
  - poster-grid: css-grid, virtualized
  - pricing-plans: columns
  - property-inspector: adjust-panel
  - quick-find: overlay, inline
  - recommendation: compact, ranked
  - task-filters: filter-bar, status-buttons
  - workspace-navigation: foldable

  Every block was reviewed in full at this revision. This is not a delta review.
- **Change since the last retained review, and how it was checked.** The last retained review is at `1899324c`. `git log --oneline 1899324c..c9ae8067` lists #267 to #288. Only #283, #285, #286, #287, and #288 touch coverage-key paths.
  - **#286** added seven blocks: chat-panel, agent-trace, context-sources, approval-request, property-inspector, quick-find, and recommendation.
  - **#285** made three content-relevant changes:
    - poster-grid's Details link now inherits the card's disabled state, with its comment and `poster-grid/artifact.json:74` rewritten;
    - `categories.json` became a map from slug to display label;
    - Sidebar gained nested navigation.
  - **#287** added Sidebar `density` and Activity `defaultExpanded`. It also set `defaultExpanded` on agent-trace's running Task row.
  - **#283 and #286 runtime changes:**
    - #283 shares motion geometry, merges duplicate CSS, and lets Link inherit a disabled GridList item (`packages/react/src/components.mjs:234,239`, `collections.mjs:966`);
    - #286 switches CommandPalette's muted text to `semantic.content.muted` and gives Menu.Trigger Button's keyboard ring (`packages/react/src/styles/collections.css:882-891`).
  - **No runtime-owned string a block renders changed in `packages/react/src` over the range.** I checked each of these at this revision:
    - Sidebar's "Search", "Toggle sidebar", and "Account options", and the drawer labels (`supplemental/index.mjs:1336,1339,1369,1402-1403`);
    - SearchField's "Clear search" (`fields.mjs:592`);
    - Activity's status words (`supplemental/activity.mjs:13`);
    - PromptComposer's "Message" and "Send message" (`prompt-composer.mjs:26,253`);
    - CommandPalette's "Command results" (`supplemental/index.mjs:1066`);
    - CodeBlock's copy (`code-block.mjs:157-182`);
    - Markdown's fallback (`markdown/index.mjs:155`);
    - the breadcrumb separator (`styles/components.css:4,220`).

    "More actions" is block copy, not runtime copy (`chat-panel/examples/react/tabbed-thread.tsx:143`).
  - **Participant records.** All 38 distinct participants exist. Since `1899324c`, four participant trees changed:
    - `activity`, `grid-list`, and `sidebar` records gained behaviour and defaults text. Sidebar's `placeholder` default is still "Search". None of these is a placeholder or label a block renders.
    - The `activity` example (`catalog/components/activity/examples/react/basic.tsx:7-9`) was rewritten by #288 with fresh data.
  - **#288** rewrote the copy that my earlier, unretained review at `1873d105` had failed or advised on. It touches seven block trees:
    - agent-trace: Task rows, Tool calls, and two record lines;
    - chat-panel: the composer placeholder, and the unused menu label removed;
    - company-records and workspace-navigation: the block-owned Menu.Trigger rings removed and their notes reworded;
    - context-sources: one record line;
    - quick-find: the empty state, and the filter fields in the record;
    - recommendation: the heading, sentence, venue name, chip naming, and record lines.

    It also refreshed the Activity and DataDiff component examples, the Storybook fixtures, and the matching tests.
  - **#288 left untouched:**
    - the seven trees of account-settings, approval-request, marketing-hero, poster-grid, pricing-plans, property-inspector, and task-filters (same git tree as `1873d105`);
    - `categories.json`.

    I still re-read and re-scanned all of them.
- **Scans, all 14 directories.** Each scan ran read-only. Scratch scripts ran from a `mktemp -d` directory outside the repository, which I deleted afterwards.
  - **Content scanner.** I ran `auditPatternAssets` and `patternContentIssues` (`scanPatternContent` plus `scanLocalReferences`) from `packages/catalog/src/pattern-content.mjs` over all 20 variant sources, with each directory's tracked files as its known files.
    - Result: zero content violations, zero asset issues, and an empty licensed set in every directory.
    - Positive controls showed the scan was live:
      - `color: #ff0000` raised `content.colour-literal`;
      - `url(https://cdn.example.com/a.png)` raised `content.remote-reference`;
      - `href="/pricing"` raised `content.local-reference`;
      - `stroke="red"` raised `content.colour-literal`;
      - `src="//cdn.example.com/a.png"` raised `content.remote-reference`;
      - an unlicensed `a.png` in a scratch directory raised `content.asset-license`.
  - **Import scanner.** `scanReactImports` from `packages/catalog/src/pattern-imports.mjs` found zero violations. Every imported name maps to a declared participant, except the hook `useCommandPalette`, which maps to no component record.
    - Controls: `@muxui/react/markdown` passed; `@muxui/react/internal` and `lodash` were flagged.
  - **URLs and links.** I searched for URLs, `url()`, `@import`, `src=`, `srcSet`, and `href`.
    - The only URL is the SVG-namespace data URI in poster-grid (`css-grid.tsx:21`, `virtualized.tsx:38`).
    - All 17 `href` values are `#fragment`s:
      - 13 in workspace-navigation (`foldable.tsx:39-48,151`);
      - the two templated poster links (`css-grid.tsx:78`, `virtualized.tsx:100`);
      - `#source` (`context-sources/examples/react/excerpts.tsx:126`);
      - `#result` (`agent-trace/examples/react/thinking.tsx:65`).
    - Two host strings appear as plain text: `checklists.example.net` and `runbooks.example.org` (`thinking.tsx:16-17`). Both sit under RFC 2606 reserved domains.
    - The only email address is `sample@example.com`.
  - **Colours.** There is no hex colour and no colour function. The only named-colour hits are `white-space: nowrap`, at:
    - `company-records/examples/react/sortable.tsx:93`;
    - `task-filters/examples/react/filter-bar.tsx:87,98`;
    - `task-filters/examples/react/status-buttons.tsx:48`;
    - `recommendation/examples/react/compact.tsx:106`;
    - `recommendation/examples/react/ranked.tsx:75`.
  - **Claim words.** I searched for accessible, tested, testing, support, compliant, compliance, certified, a11y, assistive, screen reader, VoiceOver, NVDA, JAWS, TalkBack, Narrator, WCAG, guarantee, announce, verified, secure, safe, and unsafe. The only hits are:
    - the `accessibility` and `unsupported` field names in all 14 records;
    - the ARIA term "accessible name" (`poster-grid/artifact.json:70`);
    - "supporting text" (`marketing-hero/artifact.json:6`);
    - "add one if you need price changes announced" (`pricing-plans/artifact.json:60`), which is advice;
    - "unsafe links" (`chat-panel/artifact.json:79`), which states Markdown's behaviour;
    - sample copy:
      - the plan features "Community support", "Email support", and "Priority support" (`pricing-plans/examples/react/columns.tsx:7-9`);
      - the team, thread, or subtitle "Support" (`task-filters`, both variants, line 9; `chat-panel/examples/react/tabbed-thread.tsx:27-28`; `quick-find/examples/react/overlay.tsx:13`; `inline.tsx:14`);
      - "billing and support" and "Support exports" (`context-sources/examples/react/excerpts.tsx:14-15`).

    No block record now uses "assistive technology" or "announces".
  - **Brand and sample-data terms.** The search was whole-word and case-insensitive, and covered:
    - the template's list: Acme, Northwind, Contoso, Fabrikam, Initech, Globex, Hooli, Linear, Notion, Slack, GitHub, Figma, Stripe, Twenty, Attio, HubSpot, Salesforce, Apple, Google, Microsoft, Amazon, Netflix, IMDb, Spotify, Airbnb, Uber, Vercel, shadcn, Tailwind, BeUI, Solace, Ava, lorem ipsum, John, Jane, Doe, Smith;
    - AI and assistant products: OpenAI, ChatGPT, GPT, Claude, Anthropic, Sonnet, Opus, Haiku, Gemini, Bard, Copilot, Cursor, Perplexity, Mistral, Llama, Meta (the bare word; its only matches are the `meta` prop name), Grok, xAI, DeepSeek, Cohere, Midjourney, Replit, Windsurf, Devin, Lovable, Bolt, LangChain;
    - work tools: Jira, Asana, Trello, Zendesk, Intercom, Discord, Zoom, Dropbox, Shopify, Airtable, Confluence, Gmail, Outlook, Calendly, Loom, Miro, Framer, Webflow, Supabase, Firebase, AWS, Azure;
    - developer tools: Vite, npm, pnpm, yarn, npx;
    - names from the authoring plans: Expo, Memotron, Refero, Turbo, Lucide;
    - common first names: Alice, Bob, Emma, Liam, Olivia, Noah, Sarah, Mike, David, Alex, Chris.

    There is no match in any block.
  - **Source-demo vocabulary and strings.**
    - I searched for flavour, waffle, cone, gelato, sorbet, pistachio, vanilla, mint, scoop, creamery, dairy, churn, SKU, POS, stockout, supplier, vendor, Madagascar, Joy Cone, Webstaurant, cold-chain, velocity, restock, reorder, Cone King, and Larch. The only hits are the generic "Vendor" tag and "vendor list" task that the earlier reviews cleared in company-records and task-filters.
    - The strings "Want me to", "No results found", "Adjust your search to try again", "4 tool calls", "Rebuild and verify", "Verified vendor records", "Flagged stale records", and "tag a" appear in no block.
    - `git grep` over the whole repository, outside retained evidence, finds none of the demo strings that the `1873d105` review traced, including the component examples and Storybook fixtures.
  - **File names in sample data.** `launch-plan.md`, `checklist.ts`, `rollout.tsx`, `timeline.png`, `Rollout Policy.pdf`, and `Ticket Ages.csv`. None names a file in this repository.
  - **Virtualized title rule.** I re-evaluated it over all 1,000 cards with the source's own arrays:
    - 90 cards are disabled;
    - each disabled card's title contains "Disabled", and no enabled card's does;
    - the two disabled titles alternate, 45 each.
- **Source-demo comparison.** The authoring sessions kept captures of the Beautiful UI catalogue demos the blocks were designed from. I compared every string visible in them with the block sources:
  - seven agent-block captures in `<home>/.agents/plans/muxui/agent-composition-blocks-mocks/references/`:
    - Chat: `chat-composer-light.png`, `chat-composer-dark-suppliers.png`;
    - Thinking: `thinking-state-light.png`, `thinking-state-dark-{search,coding,reasoning}.png`;
    - Tool Chips: `tool-chips-light.png`;
    - Task Rows: `task-rows-light.png`, `task-rows-dark-list-expanded.png`;
    - Context Cards: `context-cards-light.png`;
    - Approval Card: `approval-card-light.png`, `approval-card-dark-q2.png`;
    - Fine-tune Card: `fine-tune-card-light.png`, `fine-tune-card-dark-select.png`;
    - Search: `search-light.png`, `search-dark-empty.png`;
    - Recommendation Card: `recommendation-card-light.png`, `recommendation-card-dark-alternatives.png`;
  - Records Table, Filter Table, and Sidebar Nav captures:
    - `<tmp>
    - `<tmp>

  The plan note at `<home>/.agents/plans/muxui/composition-blocks.md:110-113` records the standard this check applies: shipped blocks use freshly written Mux placeholder content.
- **Assets.** No block directory holds anything but its records and variant sources. No asset or `.license.json` exists, and none is required.
- **Limits.**
  - I did not run the compiler, `pnpm generate`, the test suites, the browser suites, the capture script, or the docs site.
  - I read runtime and React Aria behaviour from source; I did not run it. Browser test sources were read, not run, where a note depends on them.
  - The captures show only the states they caught. Uncaptured demo copy (preview contents, tool outputs, the Thinking reasoning text) was not compared.
  - poster-grid, marketing-hero, pricing-plans, and account-settings have no captured demo. For them, freshness rests on the demo data the earlier reviews list.

## Per-block findings

**account-settings** (Account settings; tree unchanged since `1899324c`): **Pass.**
- Sample data is "Sample user" and `sample@example.com` (`catalog/patterns/account-settings/examples/react/sections.tsx:4`). The section and field copy is generic (`sections.tsx:107-139`).
- The form calls `preventDefault` and only moves a local snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists.
- **Bounded-section test: pass.**
- **Imports match declared participants:** Button, Form, Select, Separator, Switch, Text, and TextField (`sections.tsx:2`; `artifact.json:30-66`).
- **No claim** (`catalog/patterns/account-settings/artifact.json:68-82`). "a role=status element that reads Unsaved changes, Saved, or No changes" (line 70) names a role and its text.

**agent-trace** (Agent trace; added in #286, Task rows edited in #287, Task rows and Tool calls rewritten in #288): **Pass.**
- **Category:** `conversation` (`catalog/patterns/categories.json:6`; `catalog/patterns/agent-trace/artifact.json:20`).
- **Task rows is freshly written** (`catalog/patterns/agent-trace/examples/react/task-rows.tsx:38-45`):
  - "Release prep";
  - "Checked export settings": 9 settings, 6s, "Settings updated 4", "Settings kept 5";
  - "Draft the changelog": running, 10 entries, starting open, with the ProgressBar "Grouping entries" at 40 and "Areas found 6";
  - "Prepare the announcement": queued, 1 post.

  No label or number matches the Beautiful UI Task Rows demo. The demo's "Verified vendor records", "Flagged stale records", "12/12", "7 SKUs", "68%", and "2 messages" are gone. This answers the `1873d105` failure.
- **Tool calls is freshly written** (`catalog/patterns/agent-trace/examples/react/tool-calls.tsx:16-21,80`):
  - the header "4 steps";
  - the verbs "Sketch a plan", "Update the page", "Check the release", and "Open the timeline";
  - the targets "Ordering the rollout steps", `rollout.tsx`, `run-checks release`, and `timeline.png`.

  The demo's "4 tool calls, 2 messages", its verb list, and "npm" are gone. "All checks passed." (line 19) is a placeholder preview of a placeholder call: the comment (line 24) and the record (`artifact.json:103`) say nothing runs.
- **Thinking: fresh data.**
  - Its steps, Markdown reasoning, search query and results, and coding rows are Mux-authored (`thinking.tsx:15-21,45-89`).
  - The demo's real third-party results (Joy Cone, WebstaurantStore) appear nowhere; the hosts are reserved example domains.
  - Its labels "Thinking", "Searching the web", "Running tools", "Read", "Edit", "Steps", "Reasoning", "Search", and "Coding" are the demo's, verbatim (`thinking.tsx:46,54,59,73-76,161-164`). They are generic names for trace kinds (see advisories).
- **Participant-owned copy:**
  - Activity's status words, " in ", and "N items" (`packages/react/src/supplemental/activity.mjs:13`), and its status text "Release prep: Running.";
  - CodeBlock's copy-button and diff labels (`code-block.mjs:157-182`).

  All are unchanged, generic, and rendered as the runtime defines them.
- **Imagery:** Mux stroke icons from local factories (`thinking.tsx:6-13`, `tool-calls.tsx:5-14`), and Avatar initials "R" and "S" (`thinking.tsx:64`). The four-point star is a generic straight-edged glyph, not any product's mark.
- **Bounded-section test: pass.**
  - State is local disclosure and diff state only (`thinking.tsx:25,41-42`, `tool-calls.tsx:25`). Task rows holds no state of its own.
  - The comments say nothing runs (`thinking.tsx:40`, `tool-calls.tsx:24`, `task-rows.tsx:17`).
  - No fetch, routing, or submission.
- **Imports match declared participants:**
  - Thinking: Activity, Avatar, Button, CodeBlock, Disclosure, Link, Tabs, and Text, and Markdown from `@muxui/react/markdown` (`thinking.tsx:2-3`);
  - Tool calls: Button, Disclosure, PreviewTrigger, and Text (`tool-calls.tsx:2`);
  - Task rows: Activity, ProgressBar, and Text (`task-rows.tsx:1`).

  All are declared in `artifact.json:31-87`.
- **No claim** (`artifact.json:93-107`). The #288 wording names mechanisms, and both statements match the runtime: Activity's aggregate status span has `role=status` and reads "label: Status.", and each status mark span is `aria-hidden`.
  - "the Activity aggregate status is a role=status element that reads the label and the status" (line 99);
  - "each status mark is marked aria-hidden" (line 100).
- **Stale-prone, true today:**
  - "Activity draws one stack of rows" (line 104): `Activity` accepts `variant` and ignores it (`activity.mjs:64`);
  - "Disclosure fills its trigger and has no prop to clear it" (line 105): `packages/react/src/styles/components.css:423`.

**approval-request** (Approval request; tree unchanged since `1873d105`): **Pass.**
- **Category:** `forms` (`catalog/patterns/categories.json:4`; `catalog/patterns/approval-request/artifact.json:17`).
- **Sample content** (`catalog/patterns/approval-request/examples/react/question-stepper.tsx:14-18`): three rollout questions with generic options. The end messages say "Nothing was sent." (line 106).
- **Against the Beautiful UI Approval Card capture:** the demo's questions and options ("How many flavors should we launch?", "Which market do we enter first?") are replaced. Only generic control copy is shared: "Something else", "Skip", "Continue", "1/3".
- **Imagery:** `Close`, `Up`, and `Down` stroke icons (lines 10-12).
- **Bounded-section test: pass.**
  - Answers stay in local state (lines 21-25).
  - Nothing submits, fetches, or persists.
  - The focus effect stays inside the block (lines 48-60).
- **Imports match declared participants:** Button, Card, Checkbox, CheckboxGroup, IconButton, RadioGroup, Text, and TextField (line 2; `artifact.json:28-69`).
- **No claim** (`artifact.json:71-83`). The notes name roles and states, and the unsupported list says nothing is sent (line 79).

**chat-panel** (Chat panel; added in #286, edited in #288): **Pass.**
- **Category:** `conversation` (`catalog/patterns/categories.json:6`; `catalog/patterns/chat-panel/artifact.json:19`).
- **Sample content** (`catalog/patterns/chat-panel/examples/react/tabbed-thread.tsx:16-32,144,152`):
  - the tabs "Plan" and "Support";
  - two questions, and three short Markdown replies about a launch checklist and a ticket queue;
  - generic trace lines;
  - the menu items "Rename chat" and "Clear thread";
  - the composer placeholder "Write a follow-up" (#288).

  It names no person, company, product, or model.
- **Against the Beautiful UI Chat capture:** the demo's tabs, question, trace lines, and replies are replaced. The demo's "Prompt or tag a flavor with @" frame is gone, so the placeholder no longer invites @-tagging the block does not wire.
- **Participant-owned copy:** PromptComposer's "Message" and "Send message" (`packages/react/src/supplemental/prompt-composer.mjs:26,253`).
- **Imagery:** three stroke icons (lines 6-13).
- **Bounded-section test: pass.**
  - State is the local tab, draft, and sent messages (lines 35-38).
  - Send only appends your text to the open thread (lines 153-156).
  - PromptComposer always calls `preventDefault` on its form (`prompt-composer.mjs:185-190`).
- **Imports match declared participants:** Card, IconButton, Menu, Message, PromptComposer, Tabs, and Text, and Markdown from `@muxui/react/markdown` (lines 2-3). All are declared in `artifact.json:30-71`.
- **No claim** (`artifact.json:73-87`).
  - "a Menu trigger named More actions opens a menu with the same name" (line 76) holds. The `Menu.List` has no label of its own since #288, and React Aria's MenuTrigger labels the menu by its trigger.
  - "removes raw HTML and unsafe links" (line 79) states Markdown's behaviour and is true (`packages/react/src/markdown/index.mjs:89-91,110-113,131`). It is not a security or compliance claim.
  - The unsupported list rules out sending to a model or server and streaming, and says the header actions are inert (lines 82-84).

**company-records** (Company records; `artifact.json:71` and the block's ring CSS changed in #288): **Pass.**
- **Sample content** (`catalog/patterns/company-records/examples/react/sortable.tsx:8-15`): placeholder companies named with obvious placeholder words, real city names, generic tags, and no person or owner column.
- **Against the Beautiful UI Records Table capture:** none of that demo's tags (B2B, Gelato, Wholesale, Catering, Imports, Seasonal, Dairy-free, B2C, Vegan, Cafe) reappears.
- **Imagery:** one Mux-authored inline SVG (`sortable.tsx:45-49`). CSS uses tokens only.
- **Bounded-section test: pass.** State is local `query`, `sort`, and `selected` only (`sortable.tsx:33-35`).
- **Imports match declared participants:** Button, Menu, SearchField, Table, TagGroup, and Text (`sortable.tsx:2`; `artifact.json:31-62`).
- **#288 removed the block's own ring rule.** The record now says "The row menu button is a Menu trigger, and its focus ring is the component's: a box-shadow plus a transparent outline, so an outline still shows where forced colors drop the shadow." (`artifact.json:71`). This is accurate:
  - the trigger renders through `CollectionTrigger` as a React Aria Button (`packages/react/src/collections.mjs:972`);
  - `.muxui-menu-trigger[data-focus-visible]` draws a 2px transparent outline and the box-shadow ring (`styles/collections.css:882-891`);
  - no remaining block rule sets an outline or box-shadow on `.records-menu` (`sortable.tsx:96-111`).
- **No claim** (`artifact.json:64-79`).

**context-sources** (Context sources; `artifact.json:63` changed in #288): **Pass.**
- **Category:** `collections` (`catalog/patterns/categories.json:3`; `catalog/patterns/context-sources/artifact.json:16`).
- **Sample content** (`catalog/patterns/context-sources/examples/react/excerpts.tsx:13-16`):
  - "Rollout approval rule" and "Ticket age summary";
  - two generic excerpts;
  - the files `Rollout Policy.pdf` and `Ticket Ages.csv`;
  - two placeholder locations.
- **Against the Beautiful UI Context Cards capture:** the demo's chunks, excerpts, and files are replaced. The heading "All chunks" and the count "32" (lines 108-109) are the demo's (see advisories).
- **Imagery:** two stroke icons (lines 10-11), and the Avatar fallbacks "PDF" and "CSV".
- **Bounded-section test: pass.** No state beyond `useId`. The link is `#source` and the comment says nothing is fetched (line 20).
- **Imports match declared participants:** Avatar, Card, Link, PreviewTrigger, Separator, and Text (line 2; `artifact.json:27-58`).
- **No claim** (`artifact.json:60-70`). "The file type mark is decorative and marked aria-hidden" (line 63, #288) matches the `aria-hidden` Avatar (`excerpts.tsx:127`).

**marketing-hero** (Marketing hero; tree unchanged since `1899324c`): **Pass.**
- **Copy is generic:** "Introduce your product", the descriptive line, "Get started", and "See an example" (`catalog/patterns/marketing-hero/examples/react/split.tsx:77-81`).
- **Imagery:** the visual is Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:39-58,85-101`). It has no initials, text, or mark.
- **Bounded-section test: pass.** No state, fetch, or routing.
- **Imports match declared participants:** Button and Text (`split.tsx:2`; `artifact.json:21-32`).
- **No claim** (`catalog/patterns/marketing-hero/artifact.json:34-45`).

**poster-grid** (Poster grid; tree unchanged since `1873d105`, last changed in #285): **Pass.**
- **Copy is generic:** "Sample Title" style titles, plus "Details", "Save", and "Posters" (`catalog/patterns/poster-grid/examples/react/css-grid.tsx:5-18,69,78-79`, `catalog/patterns/poster-grid/examples/react/virtualized.tsx:6-24,91,100-101`).
- **#285 comment and record line are accurate.** "The Link and the Button follow the item's disabled state." (`css-grid.tsx:77`, `virtualized.tsx:99`) and `artifact.json:74` match the runtime and the `grid-list` record:
  - Link computes `isDisabled: !href || (disabled ?? inheritedDisabled)` (`packages/react/src/components.mjs:234,239`);
  - GridList.Item provides its disabled state (`collections.mjs:966`).
- **Disabled titles.** The rule holds: 90 of 1,000 cards, each titled "Disabled". The titles match `css-grid.tsx:10,15` word for word.
- **Imagery:** an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:38`).
- **Bounded-section test: pass.** The only state is the local column count (`virtualized.tsx:43-58`) and GridList selection.
- **Imports match declared participants** (`css-grid.tsx:1`, `virtualized.tsx:2`; `artifact.json:33-64`).
- **No claim** (`artifact.json:69-82`).

**pricing-plans** (Pricing plans; tree unchanged since `1899324c`): **Pass.**
- **Copy is generic.** Plan names, features, and prices are placeholders (`catalog/patterns/pricing-plans/examples/react/columns.tsx:6-10`). "Annual saves 20%" (`columns.tsx:141`) agrees with the placeholder prices.
- Only the local `period` toggle holds state, and the calls to action are inert (`columns.tsx:15,171`).
- **Bounded-section test: pass.**
- **Imports match declared participants:** Button, Card, Text, ToggleButton, and ToggleButtonGroup (`columns.tsx:2`; `artifact.json:30-56`).
- **No claim** (`catalog/patterns/pricing-plans/artifact.json:58-71`). "add one if you need price changes announced" (line 60) is advice. "Card.Root has none" (line 70) is still true: only `Card.Button` has `selected` (`packages/react/src/supplemental/index.mjs:357-371`).

**property-inspector** (Property inspector; tree unchanged since `1873d105`): **Pass.**
- **Category:** `forms` (`catalog/patterns/categories.json:4`; `catalog/patterns/property-inspector/artifact.json:18`).
- **Sample content:** "Promo banner" (`catalog/patterns/property-inspector/examples/react/adjust-panel.tsx:94`), placeholder values (line 16), and "Standard", "Compact", and "Wide" (line 120).
- **Against the Beautiful UI Fine-tune Card capture:** the demo's "Flavor card", its values, and its types are replaced. Only generic property labels are shared.
- Adjust only marks the panel edited (line 97), and the record says so (`artifact.json:6,80-81`). The sparkle on it implies no agent run.
- **Imagery:** five Mux-drawn icons (lines 10-14). The success colour comes from a token (line 74).
- **Bounded-section test: pass.** Local state only, and nothing saves (lines 22-28).
- **Imports match declared participants** (line 2; `artifact.json:29-70`).
- **No claim** (`artifact.json:72-84`).

**quick-find** (Quick find; empty state and record edited in #288): **Pass.**
- **Category:** `navigation` (`catalog/patterns/categories.json:7`; `catalog/patterns/quick-find/artifact.json:17`).
- **Sample content:** five generic items under "Jump to" and "Ask the assistant" (`catalog/patterns/quick-find/examples/react/overlay.tsx:11-17`, `catalog/patterns/quick-find/examples/react/inline.tsx:13-16`). Choosing only reports "Chose ..." (`overlay.tsx:81`, `inline.tsx:86`).
- **Empty state.** "Nothing matches" and "Try a different word" (`overlay.tsx:74`, `inline.tsx:84`, #288) replace the demo's verbatim empty-state copy. The demo's items are also replaced.
- **Participant-owned copy:** CommandPalette's "Command results" (`packages/react/src/supplemental/index.mjs:1066`) and SearchField's "Clear search" (`fields.mjs:592`).
- **Imagery:** one stroke icon (`overlay.tsx:5-9`, `inline.tsx:5-9`).
- **Bounded-section test: pass.** Local query and chosen state only. No command has an `href`.
- **Imports match declared participants:** CommandPalette and Text, the hook `useCommandPalette`, and a type (`overlay.tsx:2`); Card, ListBox, SearchField, and Text (`inline.tsx:2`). All are declared in `artifact.json:28-54`.
- **No claim** (`artifact.json:59-69`). The #288 line (line 66) is accurate:
  - Overlay filters by title, subtitle, group, and keywords, and lists title matches first (`supplemental/index.mjs:966-976`);
  - Inline filters by title (`inline.tsx:23`).

**recommendation** (Recommendation; heading, sentence, venue, and record edited in #288): **Pass.**
- **Category:** `conversation` (`catalog/patterns/categories.json:6`; `catalog/patterns/recommendation/artifact.json:17`).
- **Sample content:**
  - the heading "Suggested venue for the team offsite" (`catalog/patterns/recommendation/examples/react/compact.tsx:110`, `catalog/patterns/recommendation/examples/react/ranked.tsx:79`);
  - "Sample Lodge is the best match, and its deposit is due in 5 days" (`compact.tsx:113`);
  - the options "Hold Sample Lodge", "Switch to the harbor loft", and "Wait for more RSVPs" with placeholder confidences (`ranked.tsx:10-14`, `compact.tsx:13-16`);
  - the status "Accepted. Nothing was booked." (`compact.tsx:129`, `ranked.tsx:100`).

  Both variants now name the same placeholder venue.
- **Against the Beautiful UI Recommendation Card capture:** the demo's order, supplier, values, and alternatives are replaced. Its "Want me to ...?" heading and "... from [chip] with ... [chip]" sentence frame are gone.
- **Imagery:** two stroke icons (`compact.tsx:10-11`, `ranked.tsx:4-8`) and the Avatar initial "S". The value chip border comes from a token (`compact.tsx:53`).
- **Bounded-section test: pass.** Local `open`, `accepted`, and `value` state only. The comments say nothing is booked (`compact.tsx:21`, `ranked.tsx:19`).
- **Imports match declared participants** (`compact.tsx:2`, `ranked.tsx:2`; `artifact.json:28-59`).
- **No claim** (`artifact.json:64-76`). The #288 lines match the code:
  - "The section is named by its heading" (line 65);
  - "a role=status element reads that nothing was booked" (line 69);
  - "The name and value chips are plain text" (line 70).

**task-filters** (Task filters; tree unchanged since `1899324c`): **Pass.**
- **Sample content:** the same eight generic office tasks, dates, statuses, and team owners in both variants, with no person's name (`catalog/patterns/task-filters/examples/react/filter-bar.tsx:4-13`, `catalog/patterns/task-filters/examples/react/status-buttons.tsx:4-13`).
- **Against the Beautiful UI Filter Table capture:** none of that demo's tasks or advisor names reappears.
- **Bounded-section test: pass** (`filter-bar.tsx:28-29`, `status-buttons.tsx:27`).
- **Imports match declared participants** (`filter-bar.tsx:2`, `status-buttons.tsx:2`; `artifact.json:29-70`).
- **No claim** (`catalog/patterns/task-filters/artifact.json:75-89`).

**workspace-navigation** (Workspace navigation; `artifact.json:66` and the block's ring CSS changed in #288; Sidebar runtime changed in #285 and #287): **Pass.**
- **Category:** `navigation` (`catalog/patterns/categories.json:7`; `catalog/patterns/workspace-navigation/artifact.json:21`).
- **Placeholder data** (`catalog/patterns/workspace-navigation/examples/react/foldable.tsx`):
  - "Sample workspace", "Example team", and the Avatar initial "S" (lines 27-32, 145);
  - "Sample user" and `sample@example.com` (line 52);
  - generic link labels (lines 39-48);
  - the placeholder main pane (lines 148-155).
- **Against the Beautiful UI Sidebar Nav capture:** none of that demo's entries ("Creamery Ops", "New chat", "Invite users 3/10", "Supplier records") reappears.
- **Participant-owned copy is unchanged.**
  - Roadmap and Reports have no `href`, so they render through `SidebarNavNode` as native `details` with the same labels.
  - "Search", "Toggle sidebar", "Account options", and the drawer labels are unchanged.
  - No `density` is set, so the Root carries no `data-density`.
- **Imagery:** ten Mux-drawn inline stroke icons (`foldable.tsx:5-19`).
- **Bounded-section test: pass.** No router or route state, every href is a `#fragment`, the current link is fixed (line 43), and the block calls only `useId` (line 57).
- **Imports match declared participants:** Avatar, Breadcrumbs, Menu, Sidebar, and Text (line 2; `artifact.json:32-58`).
- **#288 removed the block's own ring rule.** The record's line "its focus ring is the component's" (`artifact.json:66`) is accurate on the same runtime evidence as company-records. No remaining rule sets an outline or box-shadow on `.workspace-switcher` (`foldable.tsx:94-108`).
- **No claim** (`artifact.json:60-75`).

## Cross-block checks

- **Categories.** Every block's category is declared in `catalog/patterns/categories.json`:
  - collections (line 3): poster-grid, company-records, task-filters, context-sources;
  - forms (line 4): account-settings, approval-request, property-inspector;
  - conversation (line 6): chat-panel, agent-trace, recommendation;
  - navigation (line 7): workspace-navigation, quick-find;
  - hero (line 10): marketing-hero;
  - pricing (line 12): pricing-plans.
- **Imports vs participants.** Every `@muxui/react` and `@muxui/react/markdown` import in the 20 variants is a declared participant of its pattern. The exceptions map to no component record: the hook `useCommandPalette` and the type `CommandPaletteCommand`. All 38 participants resolve to component records.
- **Content scan.** No `content.remote-reference`, `content.local-reference`, `content.colour-literal`, or `content.asset-license` issue. All six positive controls fired.
- **Claims.**
  - No record or visible prose in any of the 14 blocks:
    - uses "accessible" as a quality claim;
    - says "tested", "supported", or "compliant";
    - names a screen reader or cites WCAG;
    - claims that a model, agent, or tool runs.

    No assistive-technology support claim is made (Decision 0022).
  - All records now use mechanism wording: "marked aria-hidden", "a role=status element that reads ...", "sets aria-...".
  - Agent-like sample copy ("Ask the assistant", "Searching the web", "All checks passed.", "Suggested venue") is demonstration material under `SCOPE-NONGOAL-008`. The comments and unsupported lists say it is placeholder data and that nothing runs.
- **Source-demo reuse.**
  - No block reuses distinctive data from a Beautiful UI demo. The `1873d105` failure is resolved: agent-trace's Task rows and Tool calls are freshly written.
  - What remains shared is layout and generic UI copy (see advisories). No demo-derived string traced by the `1873d105` review remains anywhere in the repository outside retained evidence, including the component examples and the Storybook fixtures.
- **Coverage key (Decision 0029 item 6).**
  - Every block's key differs from the retained `1899324c` review. 26 rendering files under `packages/react/src` changed in the range. poster-grid's tree changed, and the seven agent composition blocks were added.
  - Since this reviewer's unretained `1873d105` review, #288 changed seven block trees and the `activity` participant tree, through its example.
  - This record reads all 14 blocks at `c9ae8067` and covers each of them there.
- **Participant records, outside block content.** Several component records use AT wording:
  - "announce": `activity`, `code-block`, `message`, `prompt-composer`;
  - "assistive technology": `separator`, `table`;
  - "reports aria-expanded": `sidebar`.

  These are component records, governed by Decision 0022 for components, and no block renders them. Noted for completeness.
- **Cross-block reuse.** All are Mux-authored generic placeholders and acceptable:
  - "Sample user" and `sample@example.com` appear in account-settings and workspace-navigation;
  - "Support" names a team, thread, or subtitle in task-filters, chat-panel, and quick-find;
  - "Sample Lodge" follows the "Sample" placeholder convention of account-settings and workspace-navigation;
  - a launch, release, rollout, and export theme runs through chat-panel, agent-trace, context-sources, approval-request, and quick-find.
- **Stale-prone notes, all true at this revision:**
  - `pricing-plans/artifact.json:70`;
  - `agent-trace/artifact.json:104-105`;
  - `chat-panel/artifact.json:79`.

## Results table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | No literal colour | Imagery | Imports are declared participants | No accessibility, testing, support, or compliance claim | Bounded-section test | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| account-settings | none | none ("Sample user") | yes (`sections.tsx:4,107-139`) | yes | yes | none | yes | yes (`artifact.json:68-82`) | pass | **Pass** |
| agent-trace | none | none | yes (`task-rows.tsx:38-45`, `tool-calls.tsx:16-21,80`, `thinking.tsx:15-21,45-89`) | yes (`#result`, reserved example domains as text) | yes | inline SVG icons, Avatar initials | yes (incl. `@muxui/react/markdown`) | yes (`artifact.json:93-107`) | pass | **Pass** |
| approval-request | none | none | yes (`question-stepper.tsx:14-18,106,128`) | yes | yes | inline SVG icons (`question-stepper.tsx:5-12`) | yes | yes (`artifact.json:71-83`) | pass | **Pass** |
| chat-panel | none | none | yes (`tabbed-thread.tsx:16-32,144,152`) | yes | yes | inline SVG icons (`tabbed-thread.tsx:6-13`) | yes (incl. `@muxui/react/markdown`) | yes (`artifact.json:73-87`) | pass | **Pass** |
| company-records | none | none (no owner column) | yes (`sortable.tsx:8-15,114-124`) | yes | yes | inline SVG (`sortable.tsx:45-49`) | yes | yes (`artifact.json:64-79`) | pass | **Pass** |
| context-sources | none | none | yes (`excerpts.tsx:13-16,108-109`) | yes (`#source`) | yes | inline SVG icons, "PDF" and "CSV" marks | yes | yes (`artifact.json:60-70`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-81`) | yes | yes | inline SVG (`split.tsx:85-101`) | yes | yes (`artifact.json:34-45`) | pass | **Pass** |
| poster-grid | none | none | yes (`virtualized.tsx:6-31`, `css-grid.tsx:5-18,77`) | yes (data URI, `#` links) | yes | empty data URI (`css-grid.tsx:21`, `virtualized.tsx:38`) | yes | yes (`artifact.json:69-82`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | yes | inline SVG (`columns.tsx:164`) | yes | yes (`artifact.json:58-71`) | pass | **Pass** |
| property-inspector | none | none | yes (`adjust-panel.tsx:16,94-120`) | yes | yes | inline SVG icons (`adjust-panel.tsx:5-14`) | yes | yes (`artifact.json:72-84`) | pass | **Pass** |
| quick-find | none | none | yes (`overlay.tsx:11-17,74`, `inline.tsx:13-16,84`) | yes | yes | inline SVG icon (`overlay.tsx:5-9`, `inline.tsx:5-9`) | yes | yes (`artifact.json:59-69`) | pass | **Pass** |
| recommendation | none | none ("Sample Lodge") | yes (`compact.tsx:13-16,110-129`, `ranked.tsx:10-14,79-100`) | yes | yes | inline SVG icons, Avatar initial | yes | yes (`artifact.json:64-76`) | pass | **Pass** |
| task-filters | none | none (team owners) | yes (`filter-bar.tsx:4-15`, `status-buttons.tsx:4-15`) | yes | yes | none | yes | yes (`artifact.json:75-89`) | pass | **Pass** |
| workspace-navigation | none (one Lucide-identical chevron glyph, not a mark) | none ("Sample user", `sample@example.com`) | yes (`foldable.tsx:27-52,151-154`) | yes (`#fragment` only) | yes | inline SVG icons (`foldable.tsx:5-19`) | yes | yes (`artifact.json:60-75`) | pass | **Pass** |

## Overall verdict

**Pass.** All fourteen blocks meet the `E-BL1-10` content assertions at main commit `c9ae8067`: account-settings, agent-trace, approval-request, chat-panel, company-records, context-sources, marketing-hero, poster-grid, pricing-plans, property-inspector, quick-find, recommendation, task-filters, and workspace-navigation. For every block:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy, with no distinctive reuse from a source demo;
- no external URL or remote asset;
- no literal colour;
- no unlicensed asset;
- every import is a declared participant, with `@muxui/react/markdown` the only subpath;
- the bounded-section test passes, with no fetch, routing, persistence, or real submission;
- no record or visible prose claims accessibility, testing, support, or compliance, names a screen reader, cites WCAG, or claims that a model, agent, or tool runs.

**Resolved by #288**, against this reviewer's unretained review at `1873d105`:

- **The agent-trace failure.** Task rows had reused the Beautiful UI Task Rows demo data; it is now freshly written (`task-rows.tsx:38-45`).
- **The demo's Tool calls header, verbs, and "npm".** All replaced (`tool-calls.tsx:16-21,80`).
- **The chat-panel @ placeholder and its unused menu label.** Replaced and removed (`tabbed-thread.tsx:144,152`).
- **Assistive-technology and announcement wording.** Replaced with mechanism wording in agent-trace, context-sources, and recommendation.
- **quick-find.** The filter-field statement is now accurate per variant, and the verbatim empty state is replaced.
- **recommendation.** "Larch Lodge", the demo frame, the inconsistent venue name, and the "source chip" naming are all fixed.
- **Menu.Trigger rings.** The block-owned rings in company-records and workspace-navigation are removed, and both notes now describe the component's ring accurately.
- **Out-of-scope component data.** The demo-derived data in the Activity and DataDiff examples and in the Storybook fixtures is replaced.

No failure. These advisories are optional follow-ups and do not block this result:

- **Carried:** the pricing offer copy has no placeholder marker (`pricing-plans/examples/react/columns.tsx:127`).
- **Carried, low:** "Card.Root has none" (`pricing-plans/artifact.json:70`) is stale-prone. It is true today.
- **Carried:** the forced-colours notes (`company-records/artifact.json:71`, `workspace-navigation/artifact.json:66`) now describe the Menu trigger's own ring. They are backed by emulated, keyboard-reached tests (`packages/react/test/browser/pattern-company-records.test.mjs:270-295`, `pattern-workspace-navigation.test.mjs:316-340`), not by a real forced-colours run.
- **Carried:** the generic-word echoes "Generic Supply" and "Review the draft outline".
- **Carried:** the `Switch` chevron glyph is identical to Lucide's (`workspace-navigation/examples/react/foldable.tsx:19`).
- **Carried:** six further inline glyphs share Lucide geometry:
  - plus: `chat-panel/examples/react/tabbed-thread.tsx:11`;
  - chevron-up: `agent-trace/examples/react/thinking.tsx:12`, `approval-request/examples/react/question-stepper.tsx:11`;
  - chevron-down: `agent-trace/examples/react/tool-calls.tsx:10`, `question-stepper.tsx:12`, `recommendation/examples/react/compact.tsx:10`;
  - x: `question-stepper.tsx:10`;
  - check: `compact.tsx:11`, `ranked.tsx:6`;
  - search-x: `quick-find/examples/react/overlay.tsx:7`, `inline.tsx:7`.

  They are elementary strokes, not marks. Lucide is ISC-licensed and listed in `packages/react/NOTICE`.
- **Carried:** the Cmd or Ctrl plus B fold shortcut is the same convention as the source demo.
- **Carried:** workspace-navigation is the block closest to a page shell, so its main pane should stay a placeholder (`foldable.tsx:148-155`).
- **Carried, no change needed:** agent-trace Thinking uses the demo's generic trace labels verbatim (`thinking.tsx:46,54,59,73-76,161-164`).
- **Carried, no change needed:** context-sources keeps the demo's "All chunks" heading and "32" count (`excerpts.tsx:108-109`).
