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
| 0011 amendment 03 (with its acceptance) | [Icon affordance additions](./0011-amendment-03-icon-affordance-additions.md) | Per-component icon lists, replaced by one rule for every component. | [Decision 0011 amendment 06](./0011-amendment-06-lucide-all-components.md), now archived for [Decision 0028](../0028-standing-development-rule.md) | `d88a9313` |
| 0012 (with its acceptance) | [Mux UI identity reset](./0012-muxui-identity-reset.md) | Completed event. The identity rule is now stated directly. | The identity rule in Architecture "Executive decision" and `tooling/audits/repository-policy/repository-policy.json` | `d88a9313` |
| 0015 | [Repository migration-authority retirement](./0015-authority-retirement.md) | Completed cleanup event. | [Decision 0015 amendment 01](../0015-amendment-01-copyright-year.md) keeps the current attribution line. | `d88a9313` |
| 0021 | [Retired strategy and decision history archive](./0021-retired-strategy-history-archive.md) | Replaced by the current-state rules. | [Decision 0027](../0027-current-state-authority-and-archive.md) | `d88a9313` |
| 0010 amendment 01 | [React-primary delivery](./0010-amendment-01-react-primary-delivery.md) | React-primary delivery is now stated in Architecture and Product Scope. Its tranche-lock admission procedure is replaced by the standing rule. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0010 amendment 03 | [Comprehensive React 0.1 authority](./0010-amendment-03-comprehensive-react-0-1.md) | The committed registry now lives in Product Scope. Its decision-bearing delta list and fail-closed snapshot gate are replaced. | Product Scope "Fixed React registry", [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0011 amendment 01 (with its acceptance) | [R1 temporal adapter dependency](./0011-amendment-01-r1-temporal-adapter-dependency.md) | A six-family limit and an exact version named in a decision. Dependencies are now allowed by purpose. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0011 amendment 02 (with its acceptance) | [R1 icon dependency](./0011-amendment-02-r1-icon-dependency.md) | Per-component icon list and exact version, already replaced by amendment 06. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0011 amendment 04 (with its acceptance) | [TextEditor Tiptap exact pin](./0011-amendment-04-tiptap-exact-pin.md) | A version change record. The version now lives only in the package manifest and lockfile. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0011 amendment 05 (with its acceptance) | [Temporal adapter exact pin](./0011-amendment-05-internationalized-date-exact-pin.md) | A version change record. Re-pinning needs a normal reviewed pull request, not an amendment. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0011 amendment 06 (with its acceptance) | [Lucide icons in every component](./0011-amendment-06-lucide-all-components.md) | The icon rule is restated as a purpose-based dependency rule with the same decorative and internal-only boundary. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0014 (with its acceptance) | [IconButton family and Field deferral](./0014-icon-button-and-field-deferral.md) | Completed family admission. The Field deferral is restated. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0017 (with its acceptance) | [Text family admission](./0017-text-family-admission.md) | Completed family admission. Families no longer need a decision. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0018 (with its acceptance) | [Image, Avatar, and SelectNative admission](./0018-image-avatar-select-native-admission.md) | Completed family admission. Direct hook use is allowed by purpose. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0019 (with its acceptance) | [Mux-owned React component motion](./0019-react-component-motion.md) | A version-named dependency decision. The motion and reduced-motion boundary is restated. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0024 (with its acceptance) | [CodeBlock family admission](./0024-code-block-admission.md) | Completed family admission. The bounded-work rule is restated and its numbers live in code. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0025 (with its acceptance) | [Remaining candidates admission](./0025-remaining-candidates-admission.md) | Completed family admission. | [Decision 0028](../0028-standing-development-rule.md) | `bd85d3d5` |
| 0009 amendment 02 (with its acceptance) | [Core UI delivery skill successor identity](./0009-amendment-02-skill-routing.md) | Byte-identity tuple for a retired verifier and a skill path that no longer exists. Its guidance semantics are restated in amendments 05 and 06. | [Decision 0009 amendment 06](../0009-amendment-06-repository-delivery-skill-owner.md) | `d195cad6` |
| 0026 amendment 01 (with its acceptance) | [Blocks page-width presets](./0026-amendment-01-page-width-presets.md) | The page widths live only in code, in `apps/docs/src/lib/block-presets.ts`, and no decision text is read for them. | [Decision 0029](../0029-blocks-growth-rules.md) | `04db9be1` |
| 0026 amendment 02 (with its acceptance) | [Category-name query expectations in block growth](./0026-amendment-02-category-name-queries.md) | A narrow exception to a rule that is now general: a pull request may change a threshold when it states the change before measuring and logs it. | [Decision 0029](../0029-blocks-growth-rules.md) | `04db9be1` |

21 retired stubs were removed: Decisions 0007 and 0008, the Decision 0009 base
and amendment 03, and Decision 0010 amendments 04 to 09, with their acceptance,
envelope, and materialization files. Recover them from git history before this
change (`git show d88a9313:decisions/<file>`).
