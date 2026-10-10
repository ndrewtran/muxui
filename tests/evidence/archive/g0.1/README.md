# G0.1 retained evidence

This directory retains the immutable evidence index, records, and sanitized
command-result artifacts for roadmap milestone G0.1.

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

The index and every record also bind an enforced
`core-ui-path-manifest-v1` applicability identity over the schema package,
repository-policy owner, workspace manifests, and lockfile. Evidence-retention
commits therefore do not invalidate their own proof, while a relevant source or
tooling change fails verification until the evidence is recaptured.

Run `pnpm check` to verify canonical bytes and every content-addressed link.
The original G0.1 proof remains immutable in issue #3's merged Git history.
The current files recertify that contract after G0.2 extended the shared query
envelope; issue #4 and its pull request are mutable locators, not evidence
authorities.
