# Acceptance: Decision 0011 amendment 01

- Decision: `core-ui:decision:0011:amendment:01`
- Parent decision: `core-ui:decision:0011`
- Repository: `ndrewtran/core-ui`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted
- Approval instruction: “Approved”
- Human acceptance: Andrew / `ndrewtran`: “Approved”
- Approval timestamp: Not recorded
- GitHub comment claimed: No

## Approved proposal

Andrew's reply “Approved” immediately followed this exact proposal:

> R1.2 is implementation-complete and independently reviewed clean. One
> genuine decision blocks its PR.
>
> React Aria requires `@internationalized/date` for date/time value conversion
> but does not re-export the required parsers. Declaring the already-installed
> `3.12.3` version directly is the correct package boundary. It adds no new
> installed code and exposes no upstream API or types.
>
> The reviewed correction will:
>
> - Permit it only for `DateField`, `DatePicker`, `DateRangePicker`,
>   `TimeField`, `Calendar`, and `RangeCalendar`.
> - Keep Core-owned ISO string and range APIs.
> - Add a minimal Decision 0011 amendment, Product Scope `6.0.3`, and small
>   Architecture/Roadmap corrections.
> - Update release and packed-consumer checks.
> - Merge the authority correction, then R1.2, reconcile the Project, and
>   continue through R1.3-R1.5.
> - Preserve all publication, production, consumer, dist-tag, and final R1-exit
>   merge stops.
>
> Reply **Approved** to authorize this complete sequence.

This record binds that proposal and Andrew's exact reply to the narrow
internal `@internationalized/date@3.12.3` dependency of `@core-ui/react`, the
six named families, Core-owned ISO date/local-time/range contracts, the
internal replaceable boundary, this amendment's authority materialization,
and the later manifest/lockfile, adapter, derived-guidance, release-prepare,
packed-consumer, protected delivery, and Project reconciliation sequence.

This record claims no implementation, dependency installation, generated
guidance, evidence, support, package release, npm publication, dist-tag
mutation, Project or consumer/production mutation, or final R1-exit merge. It
does not change the 53-family/tranche/Scope-ID boundary, React Aria or styling
authority, deferred tracks, support/lifecycle rules, or existing release
stops.
