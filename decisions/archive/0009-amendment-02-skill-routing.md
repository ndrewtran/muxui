# Decision 0009 amendment 02: Core UI delivery skill successor identity

Status: Candidate; pending the designated human owner's digest-specific
acceptance.

Decision: `core-ui:decision:0009:amendment:02`
Parent decision: `core-ui:decision:0009`
Repository: `ndrewtran/core-ui`
Owner: Andrew / `ndrewtran`

## Human decision boundary

The exact bytes in this candidate are the only proposed amendment text. A
later acceptance record must name this file, its byte length, and its SHA-256
digest, and must contain the designated human owner's exact approval. Until
that record exists, this candidate authorizes planning and materialization
preparation only. It does not authorize repository authoring, a commit, a
push, a pull request, a merge, a provider or Project action, or any release or
publication operation.

If this candidate is rejected, the pre-amendment repository skill bytes remain
authoritative. Reversal after acceptance is a later append-only amendment; it
does not rewrite Decision 0009, amendment 01, or retained historical bytes.

## Existing authority remains immutable

Decision 0009, its acceptance receipt, amendment 01's acceptance receipt, and
amendment 01's implementation clarification remain byte-exact and
authoritative for their original claims. This amendment does not revise,
supersede, reinterpret, or create an exception to them.

The amendment-01 acceptance receipt states a non-materialized candidate of
4,418 bytes at SHA-256
`27dd45d4df42d62e597651c064c5dd074a584d0afb132f29760ea1d0cee882b7`.
That candidate preimage is unavailable in this frozen source. The current
materialized amendment-01 file is a separate identity: 4,676 bytes at
SHA-256
`5d83d6a1dd5c04c45f27d2366ffa673b1df115145123139e1fb85b9035611282`.
Its acceptance receipt is 794 bytes at SHA-256
`5ce7b0fe74f24d0551b06f1428604e480818e71fe29326dbf7207fb69e388677`, and
its implementation clarification is 2,270 bytes at SHA-256
`148c0426a78073776fa5b11598c2c789307c84788eb6c8c1646c585884f32dd1`.
This amendment does not claim equivalence between the receipt-stated
non-materialized candidate and the current materialized file, and it does not
require the unavailable preimage.

The current base used to inspect this candidate is commit
`dea987aca51cde9da67fe3cac16c5e69a8c46016`, tree
`af0f923abaf8cdf55acb3c402fa929cfb439335d`. It is distinct from Decision
0009's historical source/evidence topology: accepted base
`7ede0cbb758b8306ecab1a7cdcec55a1b3505a64`, evidence-only child
`082b93fdf6f1e279f5a6e32372f43d553df7852c`, protected merge
`4ff5f4b8e08e3735febe46c639e760b1da269777`, historical source
`63dee2c988759ec803f71a0353a6630bf612826c`, and historical source tree
`7ff715b1f7585af00a46474ed6840717d38353d6`.

## Exact successor tuple

This amendment admits exactly these two current successor identities:

| Path | Bytes | SHA-256 | Meaning |
| --- | ---: | --- | --- |
| `.agents/skills/core-ui-delivery/SKILL.md` | 7,839 | `34007a84eb46ef979a663357bdca641ac3661e9276b5944de03143b7b7216db9` | successor repository-local delivery guidance |
| `.agents/skills/core-ui-delivery/agents/openai.yaml` | 577 | `0cad2dfe963cdbca6b698415d0d9fe045d8e968bc198b505e7c83d24cc33869a` | separately authored, non-authoritative UI/interface metadata paired with the SKILL guidance |

The predecessor SKILL identity is 5,789 bytes at SHA-256
`5695b79539fd4cfe15e379cca448c6c35d59d3fa46c62044383e9381455cbae5`.
The predecessor `openai.yaml` is 279 bytes at SHA-256
`4f0c3c18739ae9b27492864845502e82056865528208a7aa76590e323163396b`.
These predecessor identities are recorded only to make the two-byte
successor transition explicit; they are not additional admitted artifacts.

`openai.yaml` is separately authored, non-authoritative UI/interface metadata
paired with the authoritative `SKILL.md`. It cannot own delivery semantics,
the canonical profile, roles, commands, or authority. If it drifts, `SKILL.md`
and the canonical delivery profile win, and the exact-tuple verifier must fail
closed. No derivation relationship is admitted by this amendment. No other
artifact, substitute path, registry, prompt, or profile identity is admitted.

## Admitted guidance semantics

The admitted SKILL successor may express only the following guidance:

1. Root remains accountable for delivery planning, architecture, difficult
   reasoning, escalated blocker resolution, delegation, and final synthesis or
   decisions.
2. Only root delegates; every delegation uses `fork_turns="none"` and the
   minimum task-local context.
3. `coder` is the normal bounded end-to-end implementation lane, with explicit
   file ownership, routine repository research/debugging/testing, and no
   external mutations or architecture decisions.
4. `researcher` is optional and read-only.
5. `reviewer` is read-only and selected only by the canonical delivery
   profile's reviewer contract.
6. `browser_debugger` is optional, advisory, and does not edit application
   code or local files.

These are operator-guidance semantics only. They create no authority source,
workflow registry, reviewer decision, dispatch, clearance, evidence,
readiness, tracker state, capability, public surface, support claim,
package/version behavior, release boundary, or external mutation.

## Fail-closed verifier rule

The current delivery-authority verifier may admit this successor tuple only
after both conditions are true:

1. Decision 0009 amendment 02 is materialized with the exact bytes and
   digest-specific identity above; and
2. a later, separate acceptance record binds the exact amendment-02 candidate
   digest and records the designated human owner's approval.

Before those conditions are true, the verifier must retain the existing
Decision 0009 current-byte checks and reject missing, replaced, or mismatched
successor bindings. The six amendment-01 historical paths remain the only
amendment-01 historical compatibility paths. No new historical exception is
created here.

Every other Decision 0009 artifact entry remains subject to its exact
current-worktree byte check. The six amendment-01 historical paths and their
existing compatibility rule remain unchanged.

## Scope and non-goals

This is a private repository-operator guidance amendment. It has no effect on
Decision 0007, Architecture, the Roadmap, Product Scope, evidence or evidence
continuation, retained historical records, the repository root authority,
React or any package, public or runtime behavior, support, release, Project,
GitHub, registries, dependencies, components, renderers, RSC, or production.

Later materialization, only after the human acceptance above, may add this
amendment, its truthful acceptance record, the two exact skill files, the
separately authored YAML interface metadata, and the minimal verifier and focused tests needed
to enforce this exact tuple. Any issue, pull request, provider, Project,
commit, push, merge, evidence, implementation, or release action is separate
and requires its own authorization.
