# Decision 0017: Text family admission

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0017-text-family-admission-acceptance.md)

## Decision

Add `Text` as a dedicated, experimental `web.react` family under the existing
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` commitment. Text applies existing Mux
typography roles and sizes to a selected native text host, preserves caller
DOM, ARIA, event, data, and slot props, and owns its public API, selectors,
and token bindings. React Aria Text remains an internal, replaceable
implementation dependency.

The finite visual vocabulary is `display`, `heading`, `title`, `label`,
`body`, `expressive`, and `mono`, with canonical size restrictions: display,
heading, and title use `s`, `m`, and `l`; label, body, expressive, and mono
also support `xs`. `color="muted"` reuses the existing muted content role and
`truncate` provides visual single-line clipping while retaining complete DOM
text. No new token values or typography roles are added.

Text may use React Aria TextContext slots for field descriptions and for
collection-item labels and descriptions. A field's label association remains
owned by its field component; `as="label"` with `htmlFor` remains the native
labeling path. A slot prop alone does not replace a field label association.

The current mapping grows from 22 to 23 supplemental families: 76 total
families, with 74 root exports and the two existing isolated subpaths. The
historical 53-family inventory and completed R1.6 evidence remain unchanged.

## Scope and delivery

Product Scope advances from `10.0.0` to `11.0.0` because the committed React
public surface expands. The existing supplemental Scope ID remains committed;
no new registry or Scope ID is needed. The addition follows ordinary React
delivery after R1.6 and requires focused SSR/hydration, native-host ref/type,
field and collection slot-association, token/style, truncation, generation,
and packed-consumer proof, plus independent public API and accessibility review.

Text remains experimental until independently promoted. This decision does
not accept evidence, mark a milestone ready or complete, authorize package
publication, change a platform track, add stable support, mutate a consumer or
production system, or authorize the final R1-exit merge. Rollback before
publication removes the new mapping and generated export through a follow-up
scope decision; existing typography tokens and field behavior remain shared
owners.
