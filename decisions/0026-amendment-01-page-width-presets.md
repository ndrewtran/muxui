# Decision 0026 amendment 01: Blocks page-width presets

- Status: recorded by the root session for Andrew's review; adoption through a
  protected pull request, with no acceptance record yet
- Parent decision: [Decision 0026](./0026-blocks-showcase-admission.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0026:amendment:01`

## Gap

The Roadmap's `E-BL1-06` requires each marketing variant to be captured "at
every page-width preset, narrowest to widest, in light and dark, with no
horizontal overflow at any preset". Neither the Roadmap nor Decision 0026 names
those presets, so the assertion cannot be tested or retained until the list is
fixed. This amendment fixes it. It does not rewrite the Roadmap row or Decision
0026, and it changes no scope, no commitment state, and no other assertion.

## Decision

1. **Page-width presets.** The page-width presets are **360, 768, 1024, 1280,
   and 1920** CSS pixels, narrowest to widest. A marketing variant is judged as
   a page: its standalone preview route (`/blocks/<block>/<variant>/preview/`)
   is loaded at a viewport of each width, in light and dark, and passes only
   when the document does not scroll horizontally. The capture is the full
   page.
2. **Toolbar presets stay separate.** The Blocks toolbar's width presets (`S`
   360, `M` 768, `L` 1280, and `Full`, which fills the stage) size the isolated
   preview inside the Blocks layout. `E-BL1-06` captures every variant at each
   of them, in light and dark. They are not page widths and do not replace the
   list above.
3. **One owner.** Both lists are display choices, not catalog facts. They live
   in `apps/docs/src/lib/block-presets.ts`, which the toolbar and the browser
   proof both read, so neither can drift from the other. Changing a list is a
   deliberate edit to that module and this amendment, and it invalidates the
   retained `E-BL1-06` captures taken with the old list.

## Non-goals

This amendment does not change `@muxui/react`, add a component, token, or
dependency, add a block category, publish or deploy anything, or claim
assistive-technology support. The widths describe where a block is checked for
horizontal overflow. They are not a responsive-support claim for any consumer
page, and they never apply to a consumer project.

## Reversal

Delete this record and restore the Roadmap row's open wording. The retained
`E-BL1-06` captures stay as the historical result for the list in force when
they were taken.
