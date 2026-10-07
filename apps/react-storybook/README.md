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

```sh
pnpm --filter @muxui/react-storybook storybook
pnpm --filter @muxui/react-storybook check
pnpm --filter @muxui/react-storybook build
```

For bounded verification, `pnpm check --component <family-or-slug>` runs
selected React and Storybook family audits and `pnpm check --package
@muxui/react-storybook` covers the package scope. Common scope and proof rules
live in the root [`AGENTS.md`](../../AGENTS.md) Verification section.

Direct package checks run the complete browser audits. The colour audit uses
two isolated browser contexts by default. The a11y audit defaults to one worker
while its full two-worker run is being hardened; set
`MUXUI_STORYBOOK_A11Y_WORKERS=2` for an explicit comparison. Set
`MUXUI_STORYBOOK_COLORS_WORKERS=1` to run the colour audit serially when
comparing timings.

The policy runner uses `pnpm --filter @muxui/react-storybook run check:scoped`
for focused Storybook work. Set `MUXUI_STORYBOOK_AUDIT_PROOF=story` with
`MUXUI_STORYBOOK_FAMILIES` and exact `MUXUI_STORYBOOK_STORY_IDS` to check only
those pages in both schemes. `component` checks every page in the selected
families, `theme` checks palette paints and colour contrast across both schemes
for all consumer pages unless family or page filters narrow it, and `chrome`
checks manager and docs colours. `full` delegates to the complete package audit.
Canonical page IDs and authored example source mappings come from the generated
`.storybook/generated/manifest.mjs` page index.
