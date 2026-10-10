# Acceptance: Decision 0011 amendment 06

- Decision: `muxui:decision:0011:amendment:06`
- Parent decision: `muxui:decision:0011`
- Decision path: `decisions/0011-amendment-06-lucide-all-components.md`
- Acceptance path: `decisions/0011-amendment-06-lucide-all-components-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026
- Human acceptance: Andrew / `ndrewtran`: “Lucide should be used for all components, not just for those in Decision 0011. Future components should NOT require approval to use Lucide icons.”

## Accepted direction

Lucide for every component. Andrew's direction was:

> Lucide should be used for all components, not just for those in Decision 0011. Future components should NOT require approval to use Lucide icons.

The amendment records that `lucide-react` is the default internal icon source
for decorative affordances in every `@muxui/react` component, current and
future, with no per-component amendment or approval. It keeps the exact
`lucide-react@1.37.0` pin, the internal-only boundary, the decorative
accessibility semantics, the license notices, and the reproof rule unchanged.
It supersedes the per-component lists in Decision 0011 amendments 02 and 03 and
the R1.6 supplemental list, and the Architecture, Roadmap, and Product Scope
text that restated them is amended to match.

This direction does not authorize a Lucide package for any other renderer, a
change to the pinned version, or a public Icon API.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the amendment, or that a
package was published.
