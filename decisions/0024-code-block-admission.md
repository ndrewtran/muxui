# Decision 0024: CodeBlock family admission

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0024-code-block-admission-acceptance.md)

## Decision

Add `CodeBlock` as an experimental, Mux UI-owned `web.react` family in the
existing `@muxui/react` root under `SCOPE-REACT-DONOR-SUPPLEMENTAL-001`.
Its workflow is presenting readable code and reviewing before/after changes.
Beautiful UI's rendered Code Block appearance is the selected design basis;
Mux owns the implementation, types, selectors, API, tokens, and accessibility.
No third-party component source, CSS, assets, or API is copied.

The compact API discriminates `mode="code"` with `source` (the default mode)
from `mode="diff"` with `before` and `after`. Shared `language` and `filename`
are metadata; `lineNumbers`, `copyable`, and `wrap` govern presentation.
The native div host attributes/ref and native `onCopy` ClipboardEvent survive.
Text is escaped plain `pre`/`code`, with no syntax-highlighting dependency,
parser, editor, patch application, task engine, or remote resources.

Copying occurs only on explicit activation and copies the exact source or
updated input, never gutters or markers. Success follows real clipboard
fulfillment; failure exposes a manual-copy message. Old/new numbering and
spoken added/removed labels convey changes beyond color. A bounded line diff
uses at most 250,000 middle LCS cells after trimming equal edges; larger
changes have an explicitly labeled replacement fallback. Each input rejects
more than 1,000,000 UTF-16 units or 10,000 lines (including a trailing blank
line). Copied feedback is bounded and never repeats: a fulfilled write shows a
Check icon and a `Copied` tooltip, then returns to the Copy icon after three
seconds, or sooner when a mouse or pen pointer leaves the button, focus leaves
it, or Escape is pressed. Touch departure keeps the feedback, and a newer copy,
changed content, or unmount clears the pending reset. There is no repeating
animation.

The existing semantic surface, border, content, focus, typography, spacing,
shape, and success/invalid status tokens are reused. Two component-owned
added/removed background tokens mix those existing accents with transparent
paint; token contract advances additively from `5.0.0` to `5.1.0`, and
canonical token/dependent proof covers this bounded addition. Runtime dependencies
and the two existing isolated subpaths remain unchanged. The current mapping
becomes 27 supplemental families and 80 total families, with 78 root exports.
The historical 53-family floor and completed R1 evidence remain immutable.

The October 6, 2026 user correction requires the code identity icon to use
the existing internal pinned Lucide `code-xml` module and the copy control
to follow existing Mux Button states. Textual added/removed counts and line
markers remain text. This introduces no dependency or public icon API. A later
user-approved change adds the copied feedback above with the existing Mux
Tooltip and the same internal Lucide edge, again without a new dependency or
public API.

## Scope and proof

Product Scope advances from `15.0.2` to `16.0.0` for this one committed public
family. The existing Scope ID is extended, with no second inventory, package,
platform, support claim, or G3 activation. Deliver as a bounded post-R1 React
addition, with current mapping/projection and platform/release checks routed
through `E-R1.6-01`, `E-R1.6-03`, `E-R1.6-04`, and `E-R1.6-07`; historical
retained evidence is not rewritten or claimed to prove this addition.

Focused proof covers native refs/types, escaping/whitespace, empty/repeated/
trailing-newline diffs and bounds, clipboard success/rejection/unavailability,
stale completion and the copied-feedback reset, SSR/hydration, keyboard/focus,
overflow/wrapping, light/dark token styles, canonical examples, generation
identity, root module isolation, and clean packed-consumer use. Independent
review covers public API, a11y, the line-diff budget, and ownership. No
assistive-technology support claim follows from the deterministic and browser
checks.

Only CodeBlock enters the public surface. Open work routes to this existing
Scope ID and named addition without changing completed tracker/evidence
history; live tracker reconciliation and protected-PR adoption remain pending.
No clipboard access occurs on mount and no content is sent remotely. Before
publication, rollback requires an explicit follow-up scope change removing
this mapping/export and regenerating projections. This decision authorizes
neither publication, dist-tags, production, consumer changes, stable support,
secondary renderer activation, nor a final R1-exit merge.

## Amendment 01: Shiki highlighting, accepted 7 October 2026

The original plain-text-only and unchanged-runtime-dependency clauses above
record the initial admission. This amendment supersedes those two exclusions
for CodeBlock only. The observed workflow is reading syntax-highlighted code
and before/after changes through the existing experimental React family.

Admit exact `shiki@4.5.0` as a private, replaceable runtime dependency of
`@muxui/react`. Registry metadata identifies MIT and Node >=20, compatible
with the workspace engine. Manifest, lockfile integrity, license/notice and
packed-consumer identity remain proof obligations. Use fine-grained lazy
`shiki/core`, `shiki/langs`, `shiki/engine/oniguruma`, and `shiki/wasm` imports;
no root import or SSR loads the engine or grammars. No full Shiki bundle,
public subpath, theme/provider API, upstream type, or source/token cache is added.

The existing language string selects bundled names and aliases through own-key
lookups, while displayed metadata stays unchanged. Initial hydration is plain.
Missing, plain/text/ansi, unknown, loading, failed, or over-budget highlighting
retains escaped plain code. React renders original text slices as spans; no raw
HTML or code execution is used. Before and after are independent complete
ordered grammar streams, and diff rows select their original or updated tokens.
Stale completion and unmount cannot update a newer listing. Source never leaves
the component for an external service. Colors reuse semantic content default,
strong, and link roles; Mux CSS owns nested themes, contrast and forced colors.

Highlighting has aggregate limits of 50,000 UTF-16 units, 500 lines, 2,000
units per line and 20,000 output tokens across a listing's inputs. Optional
embedded-language detection uses at most eight safe bundled names. A cooperative
600 ms Shiki line limit and a 500 ms aggregate measurement checked between lines
discard the whole result if exceeded. These bound workload rather than guarantee
hard real-time execution. Accepted input, diff, copy, accessibility and motion
contracts remain intact.

Product Scope advances from 17.0.0 to 18.0.0 because an explicit non-goal and
internal dependency boundary expand. Existing `SCOPE-REACT-DONOR-SUPPLEMENTAL-001`
and `SCOPE-PKG-REACT` commitments, family/export counts, lifecycle, platforms and
release stops do not change. Current `E-R1.6-01`, `03`, `04` and `07` route
canonical mapping, behavior/styles, projections and platform/package proof.
Add grammar context, alias/unknown/failure, escaping/whitespace, hydration, stale
completion, workload, dependency integrity, root isolation, tree-shaking and
real packed-consumer checks; a runtime dependency change requires the full
deterministic workspace graph. Independent review covers API/security, lifecycle,
work budgets and ownership. This is not a new completed milestone or retained
release proof.

The Delivery Project observed on 7 October 2026 still has the historical R1.6
item #121 complete and no named CodeBlock/Shiki item; its scope/family snapshot
predates this local candidate branch. Reconciliation and protected-PR adoption
remain pending without rewriting completed evidence. Before publication, reversal
requires an explicit scope amendment removing this highlighter/dependency and
regenerating its projections. No TextEditor change, editor, token diff, patch
application, generic task engine, publication or external mutation is admitted.
