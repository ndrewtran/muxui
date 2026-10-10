# Decision 0013: React parity and private Mux theme authoring

- Status: accepted; edited to say what is still true (Decision 0027, Decision 0028)
- Decision owner: Andrew
- Scope: React parity, canonical tokens and themes, and private Scale authoring

## Decision

Mux UI keeps complete Mux-owned token and theme data and applicable React Aria
visual and interaction parity as a prepublication foundation. The private
`apps/scale` authoring surface may add, edit, preview, import, export, persist,
and round-trip themes through canonical Mux UI types, modes, aliases, and
override safety. It is an internal authoring surface and does not become a
public hosted product.

React Aria Components is an internal replaceable substrate. `@muxui/react` owns
public contracts, behavior, CSS, exports, and lifecycle. `catalog/tokens/` owns
canonical token and theme facts, `@muxui/tokens` owns transforms, and Scale owns
only its private editor and projection. No upstream implementation type,
object, import path, or editor state crosses the public boundary.

The list of supplemental families is owned by the supplemental mapping and
needs no decision (Decision 0028). Canonical Mux UI names are the public
vocabulary. Applicable third-party font license and notice requirements remain
in force.

## Required proof and boundaries

- Matched light and dark fixtures compare CSS, anatomy, interaction, variants,
  and states for every mapped component. Missing states or fixtures fail
  closed.
- Storybook examples render canonical Mux UI tokens and themes as projections.
  They do not own canonical data.
- Scale round-trip proof includes visible loss and rejection diagnostics and
  override-safety checks.
- An optional Tailwind consumer adapter may compile a clean consumer, while
  Tailwind stays outside Mux runtime, peer, generated-source, and styling-engine
  closure.
- Internal dependencies follow the purpose-based rules in Decision 0028,
  including module isolation, integrity, license and notice, peer
  compatibility, lockfile, tree-shaking, SSR and hydration, packed-consumer,
  and Markdown security proof.

This decision changes no token values or IDs, public API, package or platform
boundary, support claim, or release status. React Native and framework-free web
remain deferred. Publication, registry mutation, stable support, hosted Scale,
external design-tool interchange, and the final R1-exit merge remain separate
stops.
