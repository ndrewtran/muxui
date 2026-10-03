# Decision 0011 amendment 03: icon affordance additions

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: `muxui:decision:0011`, as amended by `muxui:decision:0011:amendment:02`
- Decision: `muxui:decision:0011:amendment:03`
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0011-amendment-03-icon-affordance-additions-acceptance.md)

## Decision

The existing internal, replaceable `lucide-react@1.37.0` edge of
`@muxui/react` may also be used for the `Tabs` overflow scroll buttons, the
`Disclosure` trigger chevron, and the `CheckboxField` indicator. This adds
exactly seven Lucide affordances.

Four are in the private `Tabs` motion module:

| Tabs orientation | Button accessible name | Lucide icon |
| --- | --- | --- |
| Horizontal | `Scroll tabs left` | `chevron-left` |
| Horizontal | `Scroll tabs right` | `chevron-right` |
| Vertical | `Scroll tabs up` | `chevron-up` |
| Vertical | `Scroll tabs down` | `chevron-down` |

The buttons appear only for the `overflow` variant while the tab list
overflows. The accessible name comes from the Mux-owned button label, never
from an icon name.

The fifth is the `Disclosure` trigger's `chevron-down`, which shows the
expanded state when a `Disclosure` is inside a `DisclosureGroup`. The trigger
button takes its accessible name from the visible `Disclosure` title.

The sixth and seventh are the `CheckboxField` indicator's `check` (selected)
and `minus` (indeterminate), which mirror the already approved `Checkbox`
icons. The checkbox input takes its accessible name from the visible label
text that wraps it.

Every added icon is decorative: hidden from the accessibility tree and
non-focusable. Amendment 02's other limits still apply. Mux UI owns every
public contract. No Lucide export, type, name, prop, or import path is
exposed, and no public Icon API, icon catalog, or icon package is created.

## Authority effect

This amendment extends amendment 02's affordance list by three existing
families. The dependency name, exact version, npm integrity, ISC and
Feather-derived MIT notices, and React peer boundary are unchanged. No
dependency is added, removed, or re-pinned.

`SCOPE-COMP-TABS-REACT` (R1.3) and `SCOPE-COMP-DISCLOSURE-REACT` (R1.1)
remain `committed` under their existing tranches. `CheckboxField` stays an
R1.6 supplemental root under `SCOPE-REACT-DONOR-SUPPLEMENTAL-001`. No family,
Scope ID, commitment state, public API, package, platform, support or
lifecycle claim, or release boundary changes. On its own, this is a
patch-level Product Scope clarification.

Architecture's Lucide affordance lists are amended in the same change to
name these icons, so Architecture, Roadmap, Product Scope, and this amendment
agree. Andrew approved that Architecture edit; the acceptance record quotes
him.

## Proof

Existing Lucide proof covers the four `Tabs` icons, the `Disclosure` chevron,
and the `CheckboxField` check and minus. It checks the exact dependency, the
absence of public leakage, the selected icon modules, and the decorative and
labelled semantics of each icon. Changing the icon mapping, geometry, or
accessibility semantics invalidates the affected `Tabs`, `Disclosure`, or
`CheckboxField` visual comparison, as amendment 02 requires.

## Reversal

Reversal is append-only. A successor decision may replace these icons with
Mux-owned artwork and withdraw this admission. Historical records are not
rewritten.
