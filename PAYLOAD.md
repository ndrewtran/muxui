# Payload note for the peblish release candidate

Candidate `@muxui/react@0.1.0-rc.6` (a local build of this branch, not published) against the published `0.1.0-rc.5`. Sizes are
kB of 1000 bytes.

## How it was measured

One Vite 8.3.6 production build per scenario (React 19.2.9, `rolldown`, minified), each importing from the installed tarball
exactly as an app would. JS is the entry's static import graph, gzip level 9, and includes React DOM (59.0 kB gzip on its own).
CSS is what Vite emits. Fonts are measured twice: as emitted files, and as bytes a server sends to Chrome for a page that
uses the text (TTF gzip-compressed as a CDN would, woff2 as is).

Scenarios: `button` (`Button`), `shell` (Button, Link, Menu, Tabs, Dialog, Tooltip, ToastProvider, ColorModeToggle, plus
`styles.css` and `themes.css`), `composer` (`@muxui/react/text-editor`), `gate` (the spike's gate route set). The gate scenario
less React DOM (190 kB raw, 59 kB gzip) is 1271 kB raw and 377 kB gzip, which matches the spike's 1.27 MB and 381 kB chunk.

## Before and after

| Scenario | JS raw | JS gzip | CSS raw | CSS gzip |
| --- | --- | --- | --- | --- |
| button, rc.5 | 231.1 | 72.3 | 591.2 | 59.5 |
| button, candidate | 231.1 | 72.3 | 599.5 | 60.4 |
| shell, rc.5 | 646.0 | 189.0 | 977.4 | 88.3 |
| shell, candidate | 646.0 | 189.0 | 985.8 | 89.2 |
| composer, rc.5 | 811.1 | 251.7 | 591.2 | 59.5 |
| composer, candidate | 811.1 | 251.7 | 599.5 | 60.4 |
| gate, rc.5 | 1460.7 | 435.7 | 977.4 | 88.3 |
| gate, candidate | 1460.7 | 435.7 | 985.8 | 89.2 |

JS is unchanged and CSS grows by 8.3 kB raw (0.9 kB gzip) for the 28 new `@font-face` rules. The reduction is in fonts.

### Fonts

| Page | rc.5 sent | Candidate sent |
| --- | --- | --- |
| English prose, italics, bold, one code span | 1107.8 | 259.2 |
| Polish and German prose, one code span | 599.3 | 310.9 |
| Russian prose, one code span | 599.3 | 173.5 |

The emitted font files in a build grow from 6 files and 2743 kB to 34 files and 3884 kB, because the complete TTFs stay as the
fallback for any character no slice holds. A browser fetches only what a page uses, so the emitted total is disk, not payload.

## What changed in the package

- Fonts: every family and style now has woff2 slices by script (latin, latin-ext, cyrillic, greek, vietnamese; Google Fonts'
  ranges, latin declared last) after its complete TTF. The browser tries later faces first per character, so Latin text
  fetches one slice (Inter 106 kB, Inter italic 116 kB, Roboto Mono 38 kB) and the TTF loads only for a character no slice
  holds (arrows, polytonic Greek, symbols). Slices keep every OpenType feature and variation axis. In Chrome 156, text in 10
  family, weight, style and feature combinations is pixel-identical to the TTF for Latin, Cyrillic and Greek; text that mixes
  scripts differs by under 1 px per 500 px because kerning does not cross a slice boundary (Playfair latin-ext: 3 px). No API
  or token changed; the TTF assets and their catalog hashes are untouched.
- JS: no change needed. The root barrel already tree-shakes: `import { Button } from '@muxui/react'` is React DOM (59.0 gzip)
  plus 13.3 gzip of Mux and React Aria, `test/tree-shaking.test.mjs` guards it, and motion and Lucide are imported per module.

## Where the rest of the weight is, and what peblish can do now

React Aria's translated strings are 115 kB raw of the shell bundle (238 modules). `@react-aria/optimize-locales-plugin` 2.1.0
works with Vite 8 and removes the locales an app does not ship:

| Shell scenario | JS gzip |
| --- | --- |
| all locales (default) | 189.0 |
| en-US, de-DE, fr-FR, es-ES, ja-JP | 166.6 |
| en-US only | 162.7 |

Other levers, all on the peblish side:

- Import `@muxui/react/styles.css` only. `themes.css` (15 presets) adds 29 kB gzip, and `styles.css` already carries the
  default palette, whose brand colour is `standard-harbour`'s (`#025768`). Import it only if users pick a preset.
- Load `@muxui/react/text-editor` in the composer route only: it is 193 kB gzip on top of React DOM (Tiptap and ProseMirror).
- Do not import `@muxui/react/markdown`; peblish renders Markdown on the server.
- Mount `MuxProvider` once with the detected locale; React Aria then reads no locale from the browser after hydration.

## Shiki and the Nitro `onig.wasm` failure

Shiki is reachable from the package root, through `CodeBlock` only: `generated/code-block-highlight.mjs` dynamically imports
`shiki/core`, `shiki/engine/oniguruma`, `shiki/langs` and `shiki/wasm`. The `@muxui/react/markdown` and `/text-editor` subpaths
do not reach it, and a client build that uses no `CodeBlock` contains none of it (the release proof checks the Button-only
build). Shiki's export map gives `shiki/wasm` an `unwasm` condition that resolves to the raw `dist/onig.wasm`, and a `default`
that resolves to the inlined `dist/wasm.mjs`. Nitro turns the `unwasm` condition on, so a Nitro build that follows the
dynamic import tries to link the raw wasm and fails. `exportConditions: ['!unwasm']` in the Nitro config selects the inlined
module. I did not reproduce the Nitro build here, so which import chain pulls Shiki into the server bundle is unverified; the
package side above is read from the installed files.

Keep the `exportConditions: ['!unwasm']` setting in peblish's Nitro config. With it, a client build of `CodeBlock` has an
initial chunk of 437 kB raw (127 kB gzip) and loads Shiki on first render: the inlined wasm is a lazy chunk of 622 kB raw
(232 kB gzip), followed by one chunk per language. If peblish highlights code on the server and never renders `CodeBlock`,
leaving it out of the imports avoids all of this.

The package is unchanged here. Moving `CodeBlock` behind its own subpath changes an export, and switching Shiki to its
JavaScript regex engine (`shiki/engine/javascript`, no wasm) changes highlighting output, so both are left as follow-ups.

## Not done, with the estimate

- Per-component CSS. `styles.css` is one generated file: 25% shared tokens (149 kB raw) and the rest spread over about 60
  families at 3 to 25 kB each. An app using 28 families still needs 53% of the rules, so splitting would save roughly 25 kB
  gzip (a leaner route more). It needs the generator to partition rules by family, new export entries, and changes to the
  stylesheet contract tests, so it was left for its own change.
- Per-preset theme CSS (`themes/<id>.css`): saves the 29 kB only for apps that offer a preset choice. Same generator and export
  work.
- `CodeBlock` behind a subpath export, or Shiki's JavaScript engine in place of the wasm one (see above).
- Slices for cyrillic-ext and greek-ext, and dropping the TTF fallback: both change the shipped file set that release proofs
  list.

## Proposed budget for peblish

Per route, first visit, transferred (gzip or woff2), excluding app code, the router and the HTML. Peblish's own framework
chunk comes on top of these.

| Route class | Mux and React JS | CSS | Fonts |
| --- | --- | --- | --- |
| Every route (layout, nav, buttons, menus, dialogs, tabs, toasts) | 170 kB, including React DOM's 59 kB; needs locale pruning (190 kB without) | 65 kB (`styles.css` only; 95 kB with `themes.css`) | 270 kB with regular, italic and code faces on a Latin page (150 kB without italics); add 141 kB for Latin Extended and 17 to 30 kB for each of Cyrillic, Greek and Vietnamese |
| Composer route, lazy chunk on top of the above | 200 kB | 0 (already in `styles.css`) | 0 |
| Any other route | the every-route figure | the every-route figure | the every-route figure |

Total for a first view of an ordinary page with italics and code: 170 + 65 + 270 = 505 kB, against 1385 kB for the same page on
rc.5 (189 + 88 + 1108). Repeat visits hit the cache for all three because Vite hashes the file names.

Reproduce: build a one-file Vite entry per scenario against the installed tarball and sum the static import graph. The font
slices come from fonttools 4.68 `pyftsubset --flavor=woff2 --layout-features=*` over the unicode ranges declared in
`packages/react/src/styles/base.css`; the repository has no script for it, so a font change repeats those two steps.

Tarball measured: `dist/muxui-react-0.1.0-rc.6.tgz`, sha256 `879b9175ef8be95a73ba58d0ee2edc2dc306dfbf0616b769a5377104ed51f29f`.
