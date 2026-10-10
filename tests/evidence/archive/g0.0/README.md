# G0.0 retained evidence

This directory retains the immutable evidence index, records, and sanitized
command-result artifacts for roadmap milestone G0.0.

## Canonical result profile

`core-ui-evidence-json-v1` is UTF-8 JSON with object keys sorted recursively,
declared array order preserved, no insignificant whitespace, no duplicate keys,
and no non-finite numbers. Files contain no trailing newline. Volatile durations,
local paths, credentials, and unrelated worktree content are excluded.

The result artifacts retain assertion-relevant observations rather than raw
console formatting. Each record names the exact command, source and executed
revisions/trees, runner image, tool versions, evidence owner, capture time,
disclosure and retention policy, invalidation conditions, and the SHA-256 of its
canonical artifact bytes. `index.json` binds each assertion to its record digest.

Run `pnpm check` to verify canonical bytes and every content-addressed link.
The SHA-256 of `index.json` is retained in the parent milestone, Evidence issues,
and pull request; those mutable surfaces are locators, not evidence authorities.
