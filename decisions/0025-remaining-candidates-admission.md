# Decision 0025: remaining Beautiful UI candidates admission

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0025-remaining-candidates-admission-acceptance.md)

## Decision

Add PromptComposer, Message, Activity and DataDiff as experimental Mux-owned
`web.react` root families under `SCOPE-REACT-DONOR-SUPPLEMENTAL-001`. Andrew's
selected Beautiful UI rendered designs are the visual basis; independently
authored Mux source, typed native host/ref/event contracts, canonical tokens,
accessibility and examples own the implementation. No upstream code, CSS,
assets or API is copied. Existing local CodeBlock admission is preserved.

PromptComposer is a native form with textarea editing, real validity/reset,
IME-safe Enter submission, Shift+Enter multiline and keyboard caret-triggered
@ sources and / commands. `onSend(value)` and `onValueChange` remain distinct
from native events. Optional attachment/model/dictation/Stop controls render
only when wired and report local caller callbacks; no upload or backend runs.

Message is a native article with sender/author and caller React children,
compact labeled actions, safe source disclosure and follow-up callbacks.
Streaming is caller-supplied, announced independently of token updates, with
no timer, focus theft, simulated AI or auto-scroll. Existing Markdown can be
explicitly composed from its isolated subpath; the root imports no parser.

Activity is a native div presenting stable-ID finite queued/running/completed/
failed/cancelled tasks as compact tools or dense list rows. Aggregate and
native item disclosures are keyboard accessible. Caller details, metadata,
time and actions never execute a task or simulate progress. Empty state is
neutral unless an explicit aggregate status is supplied.

DataDiff is a native div with a labeled semantic scalar table. Unchanged,
added, removed and updated rows preserve explicit null/false/zero. Column and
row IDs are unique; records exactly match reviewed columns. Controlled or
uncontrolled change selection excludes unchanged/disabled rows, with native
select-all mixed state and an explicit Apply callback receiving current row
order. Pending/disabled only reflect caller state; no patch engine or write
occurs. Two family-owned added/removed background tokens derive translucent
paint from existing status accents, independently of CodeBlock token roles.

The October 6, 2026 user correction requires existing pinned internal Lucide
affordances and established Mux control states. PromptComposer uses attach/
send/stop/voice/remove icons; Message uses disclosure/follow-up indicators;
Activity uses finite status marks and disclosure chevrons; DataDiff uses
updated/value-transition indicators and the existing Checkbox check/minus.
Button, IconButton, Select and Checkbox remain the control owners;
native form, textarea and item disclosure behavior remain intact. Textual
diff markers and source/command triggers remain text. No public icon API,
dependency, support promotion or direct hook affordance is added.

Andrew's October 7, 2026 correction replaces the prior SelectNative model
picker with the existing Select, preserving PromptComposer's model API and
native form/reset behavior while reusing Select's popup, keyboard and focus.

Andrew's October 7, 2026 correction consolidates Activity into its regular
dense list layout, removing the compact presentation and the public variant
prop, default and component-owned data-variant attribute. Canonical examples
and documentation present the remaining single layout. Native host data
attributes retain their caller-owned meanings.

## Scope and proof

Product Scope advances from 16.0.0 to 17.0.0; token contract advances
additively from 5.1.0 to 5.2.0. The current inventory is 84 families, 31
supplemental and 82 roots with two unchanged isolated subpaths. Runtime
dependencies, packages, schemas, platforms, G3 availability, lifecycle and
support/release boundaries stay unchanged; historical evidence is retained.

The bounded post-R1 deliverable uses `E-R1.6-01`, `E-R1.6-03`, `E-R1.6-04` and
`E-R1.6-07`. Focused types/ref/events, render/SSR/hydration, form/IME/reset,
keyboard/focus/selection/disclosures, state/errors, safe links/scalars, both
themes/mobile/forced-colors, generation identity, import isolation and packed
consumers are required. Shared token and admission owners broaden required
proof to their actual dependents. Independent review follows the frozen batch.
No full release, cross-engine or manual assistive-technology claim follows
from deterministic and isolated Chromium checks.

Live Project reconciliation and protected-PR adoption remain pending. This
record authorizes local implementation and scope work only, with no commit,
PR, merge, publication, production, consumer or tracker mutation. Reversal
before publication requires an explicit follow-up scope change removing the
mapping/exports and regenerating projections.
