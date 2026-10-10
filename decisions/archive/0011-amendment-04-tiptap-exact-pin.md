# Decision 0011 amendment 04: TextEditor Tiptap exact pin

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: `muxui:decision:0011`
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0011:amendment:04`
- Amends by reference: [Decision 0013](../0013-theme-parity-and-private-authoring.md),
  "Required proof and boundaries", the clause naming "the eight
  `@tiptap/*@3.22.3` packages for `TextEditor`"
- Accepted request: [acceptance record](./0011-amendment-04-tiptap-exact-pin-acceptance.md)

## Decision

The approved `TextEditor` Tiptap set moves from `3.22.3` to exact `3.31.4`.
The set stays the same eight direct internal runtime dependencies of
`@muxui/react`, each pinned exactly:

- `@tiptap/core@3.31.4`
- `@tiptap/pm@3.31.4`
- `@tiptap/react@3.31.4`
- `@tiptap/starter-kit@3.31.4`
- `@tiptap/extension-image@3.31.4`
- `@tiptap/extension-placeholder@3.31.4`
- `@tiptap/extension-text-align@3.31.4`
- `@tiptap/extension-text-style@3.31.4`

Where Decision 0013 and the strategy documents name `@tiptap/*@3.22.3`, read
`@tiptap/*@3.31.4` from this amendment onward. Decision 0013's text is not
rewritten; this record is the reference for the change.

## Reason

The workspace forces one Tiptap version through `pnpm-workspace.yaml`
`overrides`, but overrides do not ship to consumers.
`@tiptap/starter-kit@3.22.3` declares its 24 bundled extensions with
`^3.22.3`, so a consumer install resolves newer extensions against
`@tiptap/core@3.22.3`, and importing `@muxui/react/text-editor` throws
(`getPreviousBlockSibling` under pnpm, `cancelPositionCheck` under npm).

From `3.30.0`, every `@tiptap/*` manifest pins its Tiptap dependencies and
peers to the exact release version (Tiptap pull requests #8160 and #7593). An
exact `3.31.4` set therefore installs one Tiptap version in consumer projects
without relying on workspace overrides. The workspace overrides stay as a
guard for the repository lockfile.

## Accepted behavior changes

The upgrade changes the editor behaviors below. Andrew accepted all of them
(see the acceptance record). None changes the TextEditor API or document
grammar; each is upstream Tiptap behavior with no Mux UI code change.

- **Textbox role (`3.31.4`).** The editor element keeps `role="textbox"` after
  `setOptions()` (`getEditorViewAttributes`). Under `3.22.3`, TextEditor's
  mount-time `setOptions()` call removed the role, leaving an unnamed generic
  element. The editor now exposes the textbox role with its `label`,
  `aria-label`, or `aria-labelledby` name and its `aria-invalid`,
  `aria-required`, and `aria-readonly` states. This is recorded as an
  accessibility improvement. An editor with no accessible name now fails
  audits as an unnamed textbox, so the Storybook stories give TextEditor a
  `label`.
- **Tab after a list (`3.30.0`).** Tab at the start of a text block (paragraph
  or heading) whose previous sibling is a list nests that block into the
  list's last item instead of moving focus out of the editor. This also
  applies inside a blockquote whose previous child is a list. Shift+Tab there,
  Tab and Shift+Tab in other text blocks, and Tab again after nesting still
  move focus out as before. Inside list items, Tab and Shift+Tab keep their
  existing sink and lift behavior.
- **Backspace in a blockquote (`3.26.0`).** Backspace at the start of a
  non-first child of a blockquote lifts that child out and splits the quote;
  it used to join it into the previous child. Backspace at the start of a
  text block that directly follows a blockquote merges its text into the
  quote's last text block instead of moving the block inside the quote.
- **ArrowUp before a code block (`3.29.0`).** ArrowUp at the start of a code
  block that is the first node in the document inserts an empty paragraph
  before it (`exitOnArrowUp`, on by default), which reports an `onChange`.
  It used to do nothing.
- **Backspace in a list (`3.25.0`).** Backspace at the start of a non-first
  list item first lifts the item out of the list; a second Backspace merges it
  into the previous item. It used to merge on the first press.
- **Delete before a branching nested list (`3.25.0`).** Delete (or Mod+Delete)
  at the end of a list item whose nested list contains an item with its own
  sublist hoists the nested list's items into the parent list after the
  current item, keeping their sublists and the caret. In TextEditor, Delete at
  the end of `A` in `A > B > C` gives the sibling items `A` and `B > C`. It
  used to node-select the nested list and delete it on the next press. Other
  Delete cases keep the default join.
- **Smaller fixes.** Typing spaces after a link no longer extends the link
  (`3.31.4`), and deleting a select-all selection leaves a text cursor
  (`3.29.0`).

Browser keyboard tests cover the Tab and Shift+Tab focus exits, Tab nesting,
list-item sink and lift, blockquote Backspace, and the leading code block
ArrowUp. The Tab nesting, blockquote, and code block assertions fail on
`3.22.3`.

## Authority effect

This amendment changes no package set, component or family, public API, export
or import path, public package, platform binding, support or lifecycle claim,
compatibility claim, or release boundary. `TextEditor` remains
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` scope, and existing Scope IDs, including
`SCOPE-PKG-REACT` and `SCOPE-PROOF-PACKAGE`, keep their states. No new Scope
ID or commitment transition is introduced. Product Scope records it as a patch
clarification.

The edges remain internal, replaceable, and isolated to the `TextEditor`
module and its `@muxui/react/text-editor` subpath. Tiptap types, editor
objects, and import paths never enter the Mux UI public API. The upstream
license is MIT and its text is unchanged at `3.31.4`.

## Required proof

Decision 0013's dependency proof obligations apply to the new version: exact
manifest and lockfile pins with npm integrity, license and notice identity,
React peer compatibility, module isolation and tree-shaking, SSR and
hydration, editor browser behavior, and packed-consumer resolution of exactly
one `@tiptap/core` version.

## Non-goals and preserved stops

This amendment does not add or remove a dependency, change the TextEditor
document grammar or public contract, publish a package, change a dist-tag,
mutate a Project, consumer, or production system, or authorize the final
R1-exit pull-request merge. It claims no check result, evidence, or release.

## Reversal

Reversal is append-only. Moving the set to another version, or changing the
package set, requires a new accepted amendment and affected package,
SSR/hydration, browser, and packed-consumer reproof. Historical authority and
acceptance records are not rewritten.
