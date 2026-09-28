# Acceptance: Decision 0009 amendment 06

- Decision: `muxui:decision:0009:amendment:06`
- Parent decision: `core-ui:decision:0009`
- Decision path: `decisions/0009-amendment-06-repository-delivery-skill-owner.md`
- Acceptance path: `decisions/0009-amendment-06-repository-delivery-skill-owner-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 28 September 2026
- Request: `Does muxui-delivery-guard need to be a global skill? Shouldn't it just be scoped to the muxui project so it can be used while developing muxui?`
- Approval instruction: `Do that`, in reply to the proposal to merge the guard into the repository delivery skill through an authority pull request.
- Human acceptance: Andrew / `ndrewtran`: `Do that`

## Accepted direction

Andrew's instruction accepts the bounded Decision 0009 amendment 06
direction: the repository delivery skill becomes the single repository-scoped
owner of Mux UI delivery guidance, and the user-level `muxui-delivery-guard`
skill is retired. The decision record's proposed protection of every file under
`.agents/skills/muxui-delivery/` is not part of this acceptance; it is adopted
only when Andrew merges the pull request.

This acceptance does not claim implementation, check results, review, merge,
or repository adoption before the protected pull request is merged. The exact
amendment and skill wording are adopted only through that pull request.

Architecture, Roadmap, Product Scope, milestone states, historical evidence,
support and lifecycle claims, publication controls, the Project boundary, and
historical decision bytes remain unchanged.
