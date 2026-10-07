# Decision 0026 amendment 01: Blocks page-width presets

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0026](./0026-blocks-showcase-admission.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0026:amendment:01`
- Accepted request: [acceptance record](./0026-amendment-01-page-width-presets-acceptance.md)

## Gap

The Roadmap's `E-BL1-06` requires each marketing variant to be captured "at
every page-width preset, narrowest to widest, in light and dark, with no
horizontal overflow at any preset". Neither the Roadmap nor Decision 0026 names
those presets, so the assertion cannot be tested until the list is fixed.

## Decision

The page-width presets are **360, 768, 1024, 1280, and 1920** CSS pixels,
narrowest to widest. Each marketing variant is captured at every one of them in
light and dark, and passes only with no horizontal overflow at any of them.

The Blocks toolbar's own width presets are a docs choice, not authority. This
amendment does not name them, fix them, or change what `E-BL1-06` requires of
them.

Where Decision 0026 or the Roadmap says "page-width preset", read this list.
Decision 0026's text and the Roadmap row are not rewritten; this record is the
reference for the list.

## Authority effect

This amendment changes no scope, Scope ID, commitment state, release boundary,
package, platform, public surface, support claim, or other assertion. The widths
say where a marketing variant is checked for horizontal overflow. They are not a
responsive-support claim for any consumer page.

## Non-goals and preserved stops

This amendment does not change `@muxui/react`, add a component, token, block
category, or dependency, publish or deploy anything, or claim
assistive-technology support (Decision 0022). It claims no check result,
evidence, or milestone completion.

## Reversal

Reversal is append-only. Changing the list again requires a new accepted
amendment. Retained `E-BL1-06` captures stay as the historical result for the
list in force when they were taken. Historical authority and acceptance records
are not rewritten.
