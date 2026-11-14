# Resolver corpus

Synthetic package, catalog, renderer, release-manifest, cache and
workspace-graph tuples for the `@muxui/tooling` local-resolver tests
(`packages/tooling/test/support/resolver-corpus.mjs`).

`corpus.json` keeps its original predecessor identity. `current-corpus.mjs`
loads it under the current `muxui` identity and keeps every older tuple,
including query API versions a current reader ignores.

The fixture grammar is test-only, not a public schema. Production code reads
package manifests, the pnpm lockfile and the installed package graph.
