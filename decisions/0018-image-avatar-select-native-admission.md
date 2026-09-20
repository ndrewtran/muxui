# Decision 0018: Image, Avatar, and SelectNative admission

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0018-image-avatar-select-native-admission-acceptance.md)

## Decision

Add `Image`, `Avatar`, and `SelectNative` as experimental, Mux UI-owned
`web.react` families to cover the B18 and B20 Bento migration requirements.
The current supplemental mapping remains the single owner of these additions
under `SCOPE-REACT-DONOR-SUPPLEMENTAL-001`; the fixed 53-family inventory and
completed R1.6 migration evidence remain historical and unchanged.

This explicitly expands the post-R1.6 supplemental boundary to admit these
three families, including native-backed Image and Avatar. It does not claim
that they are React Aria components or that the original R1.6 Aria-only
inventory already admitted them. React Aria remains the default internal
substrate where it supplies useful behavior, rather than a requirement to
wrap native image semantics in an unrelated primitive.

Image preserves native image attributes, alternate text, dimensions, refs,
and load/error events, with bounded loading and fallback behavior. Avatar
provides a standalone image/fallback composition and supports fallback-only
workspace indicators. Image failure, source changes, accessible naming,
decorative use, and SSR/hydration must have deliberate behavior. Neither
family introduces image processing, an asset registry, or automatic animation.

SelectNative renders a genuine visible native `select` and retains native
options, selection/change events, form participation, reset, disabled and
required behavior. Internal React Aria `useField` supplies optional label,
description, and error associations. Mux owns public types, field styling,
selectors, and the distinction between visual control size and native list
size. The custom popup-based Select remains a separate family; this decision
does not admit the deferred generic Field family.

The existing pinned internal `react-aria@3.51.0` edge, previously admitted
directly for Resizable's `useMove`, is also admitted for SelectNative's
`useField`. This adds a named use of the existing dependency rather than a
package or version. Module isolation, peer/lockfile identity, tree-shaking,
license/notice, hydration, and packed-consumer proof remain required.

The additions reuse canonical Mux tokens and introduce no dependency or token
values. Native and React Aria implementation details do not become external
design-system contracts. Following Decision 0017's Text addition, the current
mapping contains 26 supplemental families and 79 total families, with 77 root
exports and the two existing isolated subpaths.

## Scope and proof

Product Scope advances from `11.0.0` to `12.0.0` for this explicit public
surface expansion. The existing supplemental Scope ID is extended by this
decision; no second inventory, registry, package, or platform is created.

Focused proof covers native host types and refs, image load/error/recovery,
fallback visibility and accessibility, SSR/hydration and cleanup, select
keyboard/focus and form/reset behavior, light/dark token-derived styles,
generated catalog/guidance identity, and a clean packed consumer. Independent
review covers the public API, accessibility, and native-state boundaries.
Current mapping, examples, styles, and platform/release checks reuse
`E-R1.6-01`, `E-R1.6-03`, `E-R1.6-04`, and `E-R1.6-07` without rewriting
completed historical evidence.

The instruction authorizes local scope and implementation work. It does not
accept evidence, complete a milestone, create a pull request, authorize a
merge, publish a package, change a dist-tag, mutate Bento or production, or
activate another renderer or stable support. Repository adoption remains
subject to the protected pull-request path. Before publication, removal is
an explicit follow-up scope change with regenerated projections.
