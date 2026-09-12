# Acceptance: Decision 0011 amendment 02

- Decision: `core-ui:decision:0011:amendment:02`
- Parent decision: `core-ui:decision:0011`
- Repository: `ndrewtran/core-ui`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted
- Approval instruction: “I approve `lucide-react` as an internal replaceable dependency”
- Human acceptance: Andrew / `ndrewtran`: “I approve `lucide-react` as an internal replaceable dependency”
- Exact pin confirmation: Andrew / `ndrewtran`: “Approved” (confirming the recommended exact pin `lucide-react@1.37.0`)
- Approval timestamp: Not recorded
- GitHub comment claimed: No

## Approved proposal

Andrew's explicit task approval “I approve `lucide-react` as an internal
replaceable dependency” was followed by the exact proposal and response below.

> Approved. One exact choice remains before materialization: I recommend pinning the current stable `lucide-react@1.37.0`.
>
> The boundary would be:
>
> - Existing internal control icons only
> - No public Lucide exports or types
> - No public `Icon` component or icon catalogue
> - No React Native implication
> - Core retains accessible labels and styling ownership
> - npm publication remains separate
>
> Reply “approved” to confirm the exact version. I can then record the minimal Decision 0011 amendment and continue implementation without routine approval prompts.

Andrew response: `Approved`.

This approval authorizes only the narrow internal runtime edge recorded in
Decision 0011 amendment 02. The accepted dependency is
`lucide-react@1.37.0` with npm integrity
`sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==`,
ISC license with its Feather-derived MIT notice, and React peer compatibility
with the existing React and React DOM peer boundary.

The authorization is limited to existing R1 `DatePicker`/`DateRangePicker`
calendar triggers, `Calendar`/`RangeCalendar` previous/next,
`ComboBox`/`Select` and `Tree` chevrons, `SearchField` clear, `NumberField`
plus/minus, `Checkbox` check/indeterminate, `TagGroup` remove, and
`Dialog`/`Toast` close affordances. Breadcrumb separators remain text and no
Search icon is added. Core owns all public contracts; no Lucide export, type,
name, prop, import path, public Icon API, icon catalog, icon package,
component, or new decorative affordance is authorized.

This record binds the task approval to the exact dependency tuple, internal
replaceable boundary, Core-owned accessible labels and decorative semantics,
and the later manifest/lockfile, SSR/hydration, tree-shaking, packed-consumer,
Lucide ISC/Feather-derived MIT notices, and visual-comparison invalidation proof
described by the decision.
The affected existing Scope IDs remain committed; no new Scope ID or
commitment transition is authorized.

This record claims no implementation, dependency installation, manifest or
lockfile change, generated guidance, evidence result, support or lifecycle
change, package release, npm publication, dist-tag mutation, Project or
consumer/production mutation, or final R1-exit merge. No GitHub URL, hosted
comment, or approval timestamp is claimed.
