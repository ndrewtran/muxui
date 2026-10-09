# Decision 0011 amendment 06: Lucide icons in every component

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: `muxui:decision:0011`
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0011:amendment:06`
- Amends by reference: [amendment 02](./0011-amendment-02-r1-icon-dependency.md)
  and [amendment 03](./0011-amendment-03-icon-affordance-additions.md), the
  per-component Lucide affordance lists, and the R1.6 supplemental list in
  Architecture, Roadmap, and Product Scope
- Accepted request: [acceptance record](./0011-amendment-06-lucide-all-components-acceptance.md)

## Context

Amendment 02 approved `lucide-react@1.37.0` as an internal, replaceable
dependency of `@muxui/react`, but only for a named list of R1 control
affordances. R1.6 added nine supplemental roots, and amendment 03 added the
`Tabs` overflow buttons, the `Disclosure` trigger, and the `CheckboxField`
indicator one family at a time during rc.1 preparation. Every other component
that wanted a Lucide icon needed another amendment.

## Decision

Lucide is the default internal icon source for decorative affordances in every
`@muxui/react` component, current and future. No component needs a decision,
an amendment, or approval to use a Lucide icon. This supersedes the
per-component affordance lists in amendment 02, amendment 03, and the R1.6
supplemental list, including the two exclusions amendment 02 attached to its
list (Breadcrumb separators stay text; no Search icon). Current rendering is
unchanged, and this amendment requires no code change.

The rest of the Lucide boundary is unchanged and restated here:

1. **Exact pin.** The dependency stays exact `lucide-react@1.37.0` (npm
   integrity `sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==`).
   Changing the version or the package is still a dependency decision under
   Decision 0011.
2. **Internal only.** No Lucide export, type, name, prop, or import path
   crosses the package boundary, and no public Icon API, icon catalog, or icon
   package is created, consistent with Decision 0014. Renderer source imports
   individual icon modules, never the package barrel.
3. **Decorative.** Icons are hidden from the accessibility tree and
   non-focusable unless a Mux UI binding explicitly requires another semantic,
   and an icon never supplies an accessible name. Mux UI owns every label,
   role, state, keyboard behavior, and focus rule.
4. **Notices.** Any distributed package containing the dependency preserves
   both the Lucide ISC and the Feather-derived MIT notices.
5. **Proof.** An icon mapping, geometry, or affordance change invalidates the
   affected visual comparison and reruns the affected visual, accessibility,
   SSR/hydration, tree-shaking, and packed-consumer proof, as amendment 02 and
   Architecture require.

Existing Mux-drawn internal glyphs, such as the `DatePicker` calendar glyph
and the `Button` pending indicator, may stay; this amendment does not require
converting them.

## Scope

This amendment covers the React package only. A framework-free web or React
Native renderer would need its own dependency decision for a Lucide package.
This amendment admits none, and the platform deferrals in Decision 0010 stand.

## Authority effect

Architecture, Roadmap, and Product Scope are amended in the same change to
state the general rule in place of the component lists, so the authority chain
and this amendment agree. The dependency name, exact version, npm integrity,
ISC and Feather-derived MIT notices, and React peer boundary are unchanged. No
dependency is added, removed, or re-pinned.

No family, Scope ID, commitment state, public API, package, platform, support or
lifecycle claim, or release boundary changes, and every existing Scope ID keeps
its state. On its own, this is a patch-level Product Scope clarification,
recorded as Product Scope `15.0.2`.

Amendment 02 and amendment 03 are not rewritten. From this amendment onward,
read their affordance lists as superseded by the rule above.

## Proof

Existing Lucide proof continues to cover the exact dependency and lockfile
integrity, per-icon module imports, the absence of public leakage, and the
decorative and labelled semantics of the icons each component renders. Release
preparation derives the packed icon inventory and visual-contract identity from
the packed modules, so a new icon or a changed mapping moves that identity. The
hand-kept test inventory records which sources import which icons for that
proof; it is updated alongside new icons and is not an approval list.

The tests that asserted the superseded exclusions (no Lucide icon in
`Breadcrumbs`, no `lucide-search` in `SearchField`) are removed, because the
rule they enforced no longer exists.

## Non-goals and preserved stops

This amendment adds no component, converts no existing glyph, and changes no
dependency, manifest, or lockfile. It does not publish a package, change a
dist-tag, mutate a Project, consumer, or production system, or authorize the
final R1-exit pull-request merge. It claims no check result, evidence, or
release.

## Reversal

Reversal is append-only. A successor decision may restore a component list or
replace Lucide with Mux-owned artwork, and affected visual, accessibility,
SSR/hydration, tree-shaking, and packed-consumer proof reruns. Historical
authority and acceptance records are not rewritten.
