# Acceptance: Decision 0011 amendment 04

- Decision: `muxui:decision:0011:amendment:04`
- Parent decision: `muxui:decision:0011`
- Decision path: `decisions/0011-amendment-04-tiptap-exact-pin.md`
- Acceptance path: `decisions/0011-amendment-04-tiptap-exact-pin-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 October 2026
- Human acceptance: Andrew / `ndrewtran`: “Yes, exact 3.31.4 (Recommended)”

## Accepted direction

Andrew was asked:

> Fix the text-editor install bug by moving the eight tiptap packages to exact 3.31.4 (Decision 0011 amendment 04)?

Andrew answered:

> Yes, exact 3.31.4 (Recommended)

The selected option read:

> Same eight packages, exact pins, no code or public-surface change; editor browser tests must pass. One PR with the amendment.

This accepts moving the same eight `TextEditor` packages (`@tiptap/core`,
`@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`,
`@tiptap/extension-image`, `@tiptap/extension-placeholder`,
`@tiptap/extension-text-align`, and `@tiptap/extension-text-style`) from
`3.22.3` to exact `3.31.4`, with no code or public-surface change, delivered
in one pull request together with this amendment. It covers the matching
version text in Architecture, Roadmap, and Product Scope.

## Accepted behavior changes

On 4 October 2026 Andrew answered three follow-up questions about behavior
the upgrade changes.

Textbox role. Andrew was asked:

> tiptap 3.31.4 keeps the editor's textbox role, so the unnamed Storybook stories fail the accessibility audit. How should I handle it?

Andrew answered:

> Accept role, name the stories (Recommended)

The selected option read:

> Record the role as an accessibility improvement in the amendment, and give the stories an accessible name. Storybook reruns across all components in CI.

Tab after a list. Andrew was asked:

> Tab at the start of a paragraph right after a list now nests it into the list instead of leaving the editor. Accept?

Andrew answered:

> Accept and note it (Recommended)

The selected option read:

> Record it in the amendment and add a keyboard test that Tab/Shift+Tab still let users leave the editor where they did before.

Additional editor behavior. Andrew was asked:

> Accept the additional tiptap 3.31.4 editor behavior changes (blockquote Backspace lifts out, ArrowUp before a leading code block inserts a paragraph, new nested-list Delete handling, Tab nests headings too) and record them in the amendment?

Andrew answered:

> Accept and record them (Recommended)

The selected option read:

> List every behavior change in amendment 04 with your acceptance; add keyboard tests for the blockquote and code-block cases so they're pinned.

Remaining editor behavior. Andrew was asked:

> Accept the remaining tiptap 3.31.4 changes too (two-step Backspace in lists, spaces after a link no longer extend it, select-all Delete leaves a cursor), recorded in amendment 04?

Andrew answered:

> Accept and record (Recommended)

The selected option read:

> They're upstream editing fixes; already described in the amendment, I'll quote your acceptance. Then I open the tiptap PR.

These answers accept the persistent `role="textbox"` as an accessibility
improvement, a Storybook story accessible name, and the Tab nesting behavior
for a text block (paragraph or heading) that starts right after a list, with a
keyboard test for the remaining focus exits. They also accept every other
editor behavior change the amendment lists, including blockquote Backspace,
the leading code block ArrowUp, and the nested-list Delete handling, with
keyboard tests that pin the blockquote and code block cases.

The direction requires the editor browser tests to pass. This record does not
claim that any check passed, that a pull request was opened or merged, that
the repository has adopted the amendment, or that a package was published.
