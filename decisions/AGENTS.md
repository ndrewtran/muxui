# Decision navigation

`decisions/` holds decisions that state a current rule. Decision numbers are
preserved and never reused. A live decision may be edited to stay current. A
decision that is fully replaced, applied, or retired moves with `git mv` to
`archive/`, together with its acceptance record, in one commit. It gets a line
in `archive/README.md` giving its number, title, reason, successor, and the
commit where its text was last live. Archived decisions are history, never
authority input, and are edited only to repair links. Retired stubs are
deleted; git history is the recovery path. New decisions quote Andrew's
acceptance in an `## Acceptance` section instead of a separate file. The rules
are in Decision 0027.

`pnpm check` verifies only that this directory and its `AGENTS.md` exist and
that the root route map links here. Decision content is guarded by CODEOWNERS
review, not by automated checks.
