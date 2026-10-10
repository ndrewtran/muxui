# Decision archive

Decisions here are fully replaced, applied, or retired. They are history, never
authority input, and are edited only to repair links. Decision numbers are never
reused. The rules are in
[Decision 0027](../0027-current-state-authority-and-archive.md).

Each entry gives the last commit where the decision text was live in
`decisions/`. Recover an earlier version with `git show <commit>:decisions/<file>`.

| Decision | Title | Reason | Successor | Last live commit |
| --- | --- | --- | --- | --- |
| 0009 amendment 01 (with its acceptance and the implementation clarification) | [Descendant source resolution](./0009-amendment-01-descendant-source-resolution.md) | Retired Decision 0009 delivery verifier. The verifier no longer exists. | [Decision 0011](../0011-r1-react-delivery-reset.md) ended the generic delivery profile and its historical-byte checks as a repository gate. | `d88a9313` |
| 0009 amendment 04 (with its acceptance) | [Repository-policy README historical compatibility](./0009-amendment-04-repository-policy-readme-historical-compatibility.md) | Historical-byte compatibility bridge for the same verifier. | [Decision 0011](../0011-r1-react-delivery-reset.md) removed such bridges as prerequisites. | `d88a9313` |
| 0011 amendment 03 (with its acceptance) | [Icon affordance additions](./0011-amendment-03-icon-affordance-additions.md) | Per-component icon lists, replaced by one rule for every component. | [Decision 0011 amendment 06](../0011-amendment-06-lucide-all-components.md) | `d88a9313` |
| 0012 (with its acceptance) | [Mux UI identity reset](./0012-muxui-identity-reset.md) | Completed event. The identity rule is now stated directly. | The identity rule in Architecture "Executive decision" and `tooling/audits/repository-policy/repository-policy.json` | `d88a9313` |
| 0015 | [Repository migration-authority retirement](./0015-authority-retirement.md) | Completed cleanup event. | [Decision 0015 amendment 01](../0015-amendment-01-copyright-year.md) keeps the current attribution line. | `d88a9313` |
| 0021 | [Retired strategy and decision history archive](./0021-retired-strategy-history-archive.md) | Replaced by the current-state rules. | [Decision 0027](../0027-current-state-authority-and-archive.md) | `d88a9313` |

21 retired stubs were removed: Decisions 0007 and 0008, the Decision 0009 base
and amendment 03, and Decision 0010 amendments 04 to 09, with their acceptance,
envelope, and materialization files. Recover them from git history before this
change (`git show d88a9313:decisions/<file>`).
