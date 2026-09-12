# Decision 0011 amendment 02: R1 icon dependency

- Status: accepted
- Parent decision: `core-ui:decision:0011`
- Decision owner: Andrew / `ndrewtran`
- Proposed decision: `core-ui:decision:0011:amendment:02`
- Human acceptance: Andrew / `ndrewtran`: “I approve `lucide-react` as an internal replaceable dependency”
- Exact pin confirmation: Andrew / `ndrewtran`: “Approved” (confirming the recommended exact pin `lucide-react@1.37.0`)

## Decision

Core UI approves `lucide-react@1.37.0` as a direct internal runtime dependency
of `@core-ui/react`. The npm integrity is
`sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==`,
the package license is ISC, its included Feather-derived artwork carries the
MIT notice, and it is React peer-compatible with the existing React and React
DOM peer boundary. The dependency is internal and replaceable.

It may be used only for existing R1 control affordances: the
`DatePicker`/`DateRangePicker` calendar triggers; `Calendar`/`RangeCalendar`
previous/next controls; `ComboBox`/`Select` and `Tree` chevrons; `SearchField`
clear; `NumberField` plus/minus; `Checkbox` check/indeterminate; `TagGroup`
remove; and `Dialog`/`Toast` close. Breadcrumb separators remain text, and no
Search icon is added.

Core UI owns every public contract. No Lucide export, type, name, prop, or
import path may be exposed, and no public Icon API, icon catalog, or icon
package is created. This amendment adds no component and no new decorative
affordance. Core-owned labels, roles, states, relationships, keyboard
behavior, and focus remain binding obligations; these icons are decorative and
non-focusable unless an existing Core binding explicitly requires another
semantic.

## Authority effect

This amendment records one exact, replaceable runtime edge in the accepted R1
React package graph. It changes no family, tranche, Scope ID, commitment state,
public API, public package, platform binding, support or lifecycle claim,
compatibility claim, or release boundary. The affected existing component IDs
are `SCOPE-COMP-CHECKBOX-REACT`, `SCOPE-COMP-SEARCHFIELD-REACT`,
`SCOPE-COMP-NUMBERFIELD-REACT`, `SCOPE-COMP-DATEPICKER-REACT`,
`SCOPE-COMP-DATERANGEPICKER-REACT`, `SCOPE-COMP-CALENDAR-REACT`,
`SCOPE-COMP-RANGECALENDAR-REACT`, `SCOPE-COMP-COMBOBOX-REACT`,
`SCOPE-COMP-SELECT-REACT`, `SCOPE-COMP-TREE-REACT`,
`SCOPE-COMP-TAGGROUP-REACT`, `SCOPE-COMP-DIALOG-REACT`, and
`SCOPE-COMP-TOAST-REACT`; each remains `committed` under its existing R1
tranche. The existing umbrella IDs `SCOPE-REACT-BREADTH-001`,
`SCOPE-PRODUCT-REACT-PRERELEASE`, `SCOPE-API-REACT-ERGONOMICS`, and
`SCOPE-API-WEB-HOOKS`, plus related system, platform, package, proof, and
package-guidance records, retain their existing states and boundaries.
`SCOPE-COMP-BREADCRUMBS-REACT` is not affected. No new Scope ID or commitment
transition is introduced.

## Later implementation boundary

1. **Manifest and lockfile.** `@core-ui/react` may add exactly
   `lucide-react: 1.37.0` as a direct runtime dependency. The lockfile and
   resolved installation must verify and retain the exact npm integrity. The
   packed manifest/consumer must verify the exact dependency spec/resolution
   and applicable Lucide ISC and Feather-derived MIT notices.
2. **Affordance use.** Renderer source may import only the selected Lucide
   affordance implementations for the existing boundary above. No Lucide
   export, type, name, prop, or import path becomes Core public API, and no
   public Icon API, catalog, or package is derived.
3. **Accessibility.** Core binding labels, roles, states, relationships,
   keyboard behavior, and focus remain authoritative. Decorative icons are
   non-focusable and hidden from the accessibility tree; any required
   accessible name comes from the Core control contract, never an icon name.
4. **SSR, hydration, and package proof.** Proof must cover SSR/hydration,
   tree-shaking of selected affordances, exact packed-consumer resolution,
   absence of public-surface leakage, React peer compatibility, and both the
   Lucide ISC and Feather-derived MIT license notices in any distributed
   package containing the dependency.
5. **Visual comparison.** A dependency-version, icon-mapping, geometry, or
   accessibility-semantic change invalidates the affected visual comparison
   and requires affected R1 visual, accessibility,
   SSR/hydration, tree-shaking, and packed-consumer reproof before export.

## Non-goals and preserved stops

This amendment does not add a component, decorative affordance, public Icon
API/catalog/package, React Native binding, `web.html` binding, React Native Web
profile, support or lifecycle claim, compatibility or release change, or npm
publication. It does not mutate a Project, consumer, or production
environment, change a dist-tag, or authorize the final R1-exit pull-request
merge. It does not implement the dependency, edit a manifest or lockfile,
install a package, or capture evidence.

## Reversal

Reversal is append-only. Before implementation begins, a successor decision may
reverse this edge without runtime migration. After implementation begins,
changing the exact version, integrity, license disposition, affordance set,
public boundary, package graph, accessibility semantics, or release effect
requires a new accepted decision and affected visual, accessibility,
SSR/hydration, tree-shaking, and packed-consumer reproof. Historical authority
and acceptance records are not rewritten.
