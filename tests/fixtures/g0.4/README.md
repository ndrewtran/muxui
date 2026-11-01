# G0.4 resolver activation fixtures

This directory contains synthetic, test-owned inputs for the G0.4 local
resolver. The corpus fixes the minimum pnpm package, catalog, renderer,
release-manifest, cache, and workspace-graph tuples needed before resolver
implementation begins.

The fixture grammar is not a public Core UI schema or dependency registry. The
later resolver tests may materialize these declarations into temporary
workspaces, but production code must continue to read package manifests, the
pnpm lockfile, and the installed package graph as dependency authority.

Passing the fixture-shape test proves only that the G0.4 synthetic inputs exist
and agree internally. It does not satisfy `E-G0.4-01` through `E-G0.4-05` or
prove resolver behavior. Activation and later completion remain separate human
workflow decisions.

`current-corpus.mjs` loads the corpus under the current product identity for the
resolver tests. It keeps every older tuple, including the query API versions a
current reader ignores.
