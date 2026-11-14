# Decision 0036: A second preset stylesheet chooses text colors by APCA

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0036`
- Amends: the style entry points in the Architecture and in `SCOPE-API-REACT-CSS`, and the lists of style entries in Decision 0031 items 17 and 19
- Effective: on merge

## Gap

Bento desktop will ship Mux UI presets whose text colors are chosen by APCA, while the Bento website keeps the WCAG 2 presets. Both want the same 15 presets, so the only thing that differs between the two projects is how each shade's text color is chosen.

`@muxui/react` ships one preset stylesheet, `themes.css`, whose text colors come from the WCAG 2 contrast ratio. The token compiler already compiles either method: `compileScalePresetTheme` accepts `contrastAlgorithm`, with `wcag2-endpoint-v1` as the default and `apca-endpoint-v1` as the other. But `@muxui/tokens` is private, so a consumer cannot run it, and the contract named `themes.css` as the only optional style entry (Architecture, `SCOPE-API-REACT-CSS`, Decision 0031 items 17 and 19).

## Decision

1. **Two optional theme stylesheets.** `@muxui/react` publishes `@muxui/react/themes.css` and `@muxui/react/themes-apca.css`. A project picks one at build time and imports it after `styles.css`. Bento desktop imports the APCA file and the Bento website keeps `themes.css`.
2. **The same presets, differing only in text.** The two files have identical preset IDs, selectors, `muxui.tokens` cascade layer, rule order, and property set. They differ only in the `*-fg` text tokens and the declarations that read them. `themes.css` takes each shade's text from the palette endpoint with the higher WCAG 2 contrast ratio. `themes-apca.css` takes it from the endpoint with the higher APCA 0.0.98G-4g score (absolute Lc). The `@muxui/react/themes` metadata is the same for both.
3. **One generator, no hand edits.** `packages/react/src/generate.mjs` compiles the presets once per method through the same authoring path and emits both files. Tests in `@muxui/react` hold each file to its own method's compile, the shared selectors and property order, and the rule that the files differ only in text tokens and what reads them.
4. **No new axis, switch, or compiler.** There is no new mode axis, `data-muxui-*` attribute, runtime switch, JavaScript module, or type, and no public compiler. `@muxui/tokens` stays private. Choosing a method means choosing which file to import.
5. **Copy names the method and the scores only.** APCA is not a finished standard. The README, the themes guide, and any other copy say what the file is and which score picks each text color. They make no conformance, compliance, or accessibility claim for either file, do not imply that every pair meets a threshold, and neither file promises a minimum score.

## Authority effect

- **Architecture.** The style entry points inventory and the statement of what the published-surface test checks name `themes-apca.css` beside `themes.css`.
- **Product Scope.** `SCOPE-API-REACT-CSS` names `themes-apca.css` as a second optional theme stylesheet next to `themes.css`: the same presets, with text colors chosen by APCA endpoint selection. That adds a public surface inside an existing committed item, so Product Scope takes a minor version, `23.1.0`.
  - No Scope ID is added, renumbered, reused, or removed, and no commitment changes state.
  - Release additions and removals: none. Nothing is published by this change. Evidence effect: none. Open tracker work: none.
- **Decision 0031.** Items 17 and 19 name the second entry, edited in place under Decision 0027 item 2 so the live text stays current.
- **Not authority.** The package README, `catalog/guides/themes.md`, and `packages/react/advisory/bento-migration.md` follow.

## Non-goals and preserved stops

This decision publishes no package, creates no tag, changes no dist-tag, and leaves `latest` where it is. It changes no token value, preset, palette, or default method, so `themes.css` and the `@muxui/react/themes` metadata are byte-identical before and after. It claims no stable, support, or assistive-technology property. It does not split `themes.css`, add a finer style entry, or change the cascade layers. Decision 0028's publish stop stands.

## Accepted consequence

A published style entry point is stable throughout a major (Architecture), so removing `themes-apca.css` later needs a deprecation and a major. The file is about 830 KB raw and about 35 KB gzipped, and a consumer that does not import it pays nothing at runtime.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 9 November 2026

Asked whether to update Product Scope `SCOPE-API-REACT-CSS` and the Architecture check, which named `styles.css` and the optional `themes.css` as the only style entries, Andrew answered "Update both (Recommended)", whose option text was: "Name themes-apca.css as a second optional theme stylesheet in both, recorded by a short decision file, as a minor Scope change. Decision 0031 needs no edit."

A later review found that Decision 0031 items 17 and 19 also list the style entries, so this pull request adds a pointer to this decision in each of them.

This record does not claim that any check passed or that any package, release candidate, or dist-tag changed.
