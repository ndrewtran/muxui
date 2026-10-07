# Acceptance: Decision 0026

- Decision: `muxui:decision:0026`
- Decision path: `decisions/0026-blocks-showcase-admission.md`
- Acceptance path: `decisions/0026-blocks-showcase-admission-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 7 October 2026

## Accepted direction

Andrew asked for a showcase and code resource for components and for blocks
(reusable compositions), like Tailwind Plus UI Blocks or beui.dev blocks, kept
out of the core component documentation. He then directed the root session to
proceed with drafting this decision.

Andrew reviewed a summary of the draft, which posed three open choices: block
scope, commitment state, and growth after the seed set. He also saw three
showcase mockups. His answers on 7 October 2026, verbatim:

| Question | Andrew's answer |
| --- | --- |
| Which showcase direction should the Blocks section use? | B: master-detail |
| Which compositions count as blocks? | Add marketing sections |
| How should blocks beyond the initial seed set be added? | Ordinary PRs |
| With those choices applied, how should I proceed with Decision 0026? | Accept and open the PR |

He left the commitment-state default unchanged: `admitted`, private and
unpublished.

After his acceptance, the root session wrote out the rules that make the
marketing-sections choice enforceable. These are:

- the bounded-section test;
- the `SCOPE-NONGOAL-008` demonstration-material statement, which makes the
  Product Scope change major (`15.0.0`);
- the content rules;
- the two closed category groups;
- the seed blocks;
- evidence `E-BL1-10` and `E-BL1-11`.

They are recorded in Decision 0026 and the matching amendments. Andrew reviews
them in the protected pull request, and merge waits for his approval.

Andrew authorized creating the decision and BL1 tracker issues and opening the
protected pull request. Implementation starts only after this authority change
merges. This acceptance authorizes no merge without his approval. It also
authorizes no deployment, package publication, dist-tag change,
assistive-technology claim, or component admission. This record does not claim
that checks or independent review passed, or that a pull request was merged.
