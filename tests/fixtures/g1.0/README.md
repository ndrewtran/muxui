# Token transform and descriptor fixtures

Test-only inputs. They own no token, binding or renderer fact.

- `consumers/`: synthetic consumers of the static web and native token
  transforms, imported by `packages/tokens/test/token-contract.test.mjs`. They
  are not renderer implementations.
- `packed-compatibility-source.json` and `packed-compatibility.mjs`: a closed
  pack input from which `packages/catalog/test/catalog-package.test.mjs` builds
  a synthetic descriptor and release correlation from the generated catalog. It
  creates no package, export or support result.
- `fixed-slice-needs.json`: the original observed token needs of the first
  component slices, kept as data.
