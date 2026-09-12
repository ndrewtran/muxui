# Decision 0014: IconButton family and Field deferral

- Status: accepted user direction; repository adoption through this protected PR
- Decision owner: Andrew / `ndrewtran`
- Companion issue: [#128](https://github.com/ndrewtran/muxui/issues/128)
- Accepted request: [acceptance record](./0014-icon-button-and-field-deferral-acceptance.md)

## Decision

Add `IconButton` to `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` as a dedicated,
experimental `web.react` family exported from `@muxui/react`. It composes the
existing Mux Button, accepts caller-supplied icon content, requires an explicit
accessible name, and adds square sizing. Mux owns its API, tokens, and styles;
React Aria remains an internal, replaceable implementation dependency.

Mux deliberately aligns the square control with its own minimum Button heights
and uses a static pending indicator. No new dependency, public Icon family, or
icon-library contract is introduced. Existing internal close controls retain
their current geometry.

The current mapping grows from 21 to 22 supplemental families: 75 families in
total, with 73 root exports and the same two isolated subpaths. The historical
53-family inventory and completed R1.6 evidence remain unchanged. The earliest
owners are the component artifact, renderer source, and current supplemental
mapping; downstream catalog, package guidance, and Storybook are generated.

## Field deferral

The standalone `Field` family remains unavailable. Existing named fields and
`Input.Root`, `Input.Input`, `Input.Label`, `Input.Description`, and `Input.Error`
cover ordinary field composition. Revisit a generic Field only when a consumer
needs custom or multiple controls with a shared field boundary, including
deliberate label, description, error, and validation association. This decision
creates no Field artifact, runtime, export, or commitment to a release date.

## Scope and delivery

Product Scope advances from `8.0.0` to `9.0.0` because the committed React
public surface expands. The existing supplemental Scope ID remains committed;
no new registry or Scope ID is needed. The follow-up uses ordinary React
delivery after R1.6, before the R1-exit candidate is prepared again. Relevant
proof is `E-R1.6-01`, `E-R1.6-03`, `E-R1.6-04`, and `E-R1.6-07`: focused
type, render, keyboard/focus, disabled/pending, sizing, hydration, generation,
and packed-consumer checks. A passing check does not rewrite historical parity.

Open R1-exit work (#81) must prepare its next candidate from the expanded
surface after this PR merges; completed #121 and its historical evidence are
not reopened or rewritten. No priority, assignee, or release-date change is
selected. Independent review covers this public API and accessibility boundary.

There is no package-version bump, publication, dist-tag mutation, hosted app,
production/consumer mutation, stable support, or secondary-renderer activation.
Rollback before publication removes the new mapping and generated export through
a follow-up scope decision; existing Button behavior remains the shared owner.
