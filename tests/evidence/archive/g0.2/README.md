# G0.2 retained evidence

This directory retains the immutable evidence index, records, and sanitized
command-result artifacts for roadmap milestone G0.2.

## Canonical result profile

`core-ui-evidence-json-v1` is UTF-8 JSON with object keys sorted recursively,
declared array order preserved, no insignificant whitespace, no duplicate keys,
and no trailing newline. Volatile durations, local paths, credentials, and
unrelated worktree content are excluded.

The result artifacts retain assertion-relevant observations rather than raw
console formatting. Each record binds its exact implementation revision and
tree, applicability manifest, runtime tuple, command set, owner, capture time,
disclosure and retention policy, invalidation conditions, and canonical
artifact digest. `index.json` binds every assertion to its record digest.

Run `pnpm check` to verify canonical bytes and every content-addressed link.
Issue #4 and its pull request are mutable locators, not evidence authorities.
