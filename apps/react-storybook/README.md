# Private Mux UI React Storybook

This is a private development showcase for the standalone `@muxui/react`
renderer. Storybook 10.5.10, `@storybook/react-vite` 10.5.10, and the
`@storybook/addon-a11y` 10.5.10 integration are pinned to the workspace's
React 19.2.8 and Vite 8.2.1 baseline.

The generator reads the Mux UI-owned React descriptor and the canonical R1 family
snapshot. It emits one CSF story module per family into the gitignored
`.storybook/generated/` directory. The
sidebar presents component families alphabetically, while each story retains its
R1 tranche metadata and deep-link ID. The explicit
renderer adapters are checked against that descriptor so the private projection
cannot silently gain or lose a family.

Each family shows only the standard stories that teach something for it. Default
is always shown. States appears when the family has a named state beyond its
default row that the specimen can render, Controlled and Uncontrolled when its
binding declares a controlled/default pair, Events when it declares event
channels, and Anatomy when it declares a part other than `root`. The rule is
`STORY_APPLICABILITY` in `src/storybook-factory.mjs`, shared by the generator
and the tests. Browser proof is proof, not teaching: every family keeps it,
tagged `!dev` so the sidebar hides it while the served index and the audits
still reach it by ID.

The generator also emits one page group per catalog pattern (a Block), titled
`Blocks/<Category>/<Pattern>`, with one story per variant, so a variant reads
as `Blocks/<Category>/<Pattern>/<Variant>`. Each story renders the variant's
canonical `catalog/patterns/**` source unchanged and shows that source in Docs.
A Block page group is listed in the manifest's `patterns` and `pageIndex`, not
in `families`. The scoped audits select it like a family, by pattern name or
slug (`MUXUI_STORYBOOK_FAMILIES="Poster grid"` or `poster-grid`), and run light
and dark axe and colour proof on every variant page. The full audit lists the
Block pages for those page-level audits too. A variant slug that starts with a
digit emits a `Variant`-prefixed story export (`2-column` becomes
`Variant2Column`), and generation fails when a pattern's name or slug is also a
component family's or another pattern's selection key.

Each family's Docs page is a custom page (`.storybook/component-docs-page.mjs`)
that runs the same eleven sections as the docs site's component pages: Basic
example, Installation and imports, Usage, Behavior, Examples, Used in blocks
(only when a Block uses the component), API reference, Events, Accessibility,
Anatomy and styling, and Sources. The generator reads each family's catalog
record through the canonical query API and `../component-reference.mjs`, and
embeds the result in the family's story module as the `muxuiReference`
parameter, so the page authors no per-family text. The live preview stays the
adapter Default story and the API reference stays Storybook's Controls table;
canonical examples appear as static source, not as extra stories.
`test/component-docs.test.mjs` renders every family's entry and checks the
section order and each projected fact against the catalog. An edit to a file the
page embeds (a family's catalog record, canonical example or usage guide, a
pattern record, or `apps/component-reference.mjs`) plans Storybook generation
and that test, not the browser audit.

```sh
pnpm --filter @muxui/react-storybook storybook
pnpm --filter @muxui/react-storybook check
pnpm --filter @muxui/react-storybook build
```

For bounded verification, `pnpm check --component <family-or-slug>` runs
selected React and Storybook family audits and `pnpm check --package
@muxui/react-storybook` covers the package scope. `pnpm check --files <paths>`
and the default `pnpm check` run the same story selection, with the same
`MUXUI_STORYBOOK_*` environment, that CI plans for those paths, and keep the
complete audit, with a printed notice, when that selection needs more than one
CI shard (80 pages) or cannot be planned. Common scope and proof rules live in
the root [`AGENTS.md`](../../AGENTS.md) Verification section.

Direct package checks run the complete browser audits. The a11y and colour
audits each use two isolated browser contexts by default, one per colour scheme.
Set `MUXUI_STORYBOOK_A11Y_WORKERS=1` or `MUXUI_STORYBOOK_COLORS_WORKERS=1` to
run an audit serially when comparing timings.

The policy runner uses `pnpm --filter @muxui/react-storybook run check:scoped`
for focused Storybook work. Set `MUXUI_STORYBOOK_AUDIT_PROOF=story` with
`MUXUI_STORYBOOK_FAMILIES` and exact `MUXUI_STORYBOOK_STORY_IDS` to check only
those pages in both schemes. `component` checks every page in the selected
families, `theme` checks palette paints and colour contrast across both schemes
for all consumer pages unless family or page filters narrow it, and `chrome`
checks manager and docs colours. `full` delegates to the complete package audit.
Canonical page IDs and authored example source mappings come from the generated
`.storybook/generated/manifest.mjs` page index.

Storybook's own-interface colour proofs (manager and docs paint, onboarding,
create-story, and the docs ArgsTable) prove this private host, not the library.
`MUXUI_STORYBOOK_UI_PROOF=skip` skips exactly those four tests, which keep their
names. `pnpm release:prepare` and the full plan for a push to `main` set it;
direct package checks, pull requests that change Storybook configuration or
theme, the weekly schedule, and manual CI runs keep the proofs (Decision 0030).
