# Releasing

Publishing, a dist-tag change, deprecation and unpublishing each need Andrew's
explicit yes for that exact release. Nothing else here publishes.

## Prepare locally

`pnpm release:prepare` runs the full check graph, `pnpm generate:check` and the
candidate packing and consumer matrix. It never publishes.

## Dry run

Dispatch it on `main` at the release commit; only a main dry run can be
promoted. It reuses main's green CI run for the same commit, or runs the full
`pnpm release:prepare` when there is none.

```sh
gh workflow run npm-publish.yml --ref main -f mode=dry-run \
  -f schema-version=<x.y.z-rc.N> -f catalog-version=<x.y.z-rc.N> \
  -f tooling-version=<x.y.z-rc.N> -f version=0.1.0-rc.N \
  -f prior-release=releases/<hex>.json
```

- Each version is `<source version>-rc.N`: the next rc after `next`, or `rc.1` of
  a strictly higher base. `@muxui/react` stays `0.1.0-rc.N`.
- An empty version input reuses that package from `prior-release`.
- The run uploads the `npm-candidate` artifact (published tarballs plus
  `muxui-portfolio.release-manifest.json`, kept 30 days). Its step summary lists
  each tarball's sha512.
- `mode=registry-preflight` only reads the registry for the version inputs.

## Publish

```sh
gh workflow run npm-publish.yml --ref main -f mode=publish \
  -f dry-run-id=<dry run id> -f tarball-sha512=<sha512-...,sha512-...> \
  <the same version and prior-release inputs>
```

The publish run re-verifies that dry run's artifact and never rebuilds. It
preflights the registry, publishes to `next` in order (schema, catalog, tooling,
React) with provenance, and reads each package back. The first failure stops the
set. `mode=publish` runs only from `main`.

- A package that exists on npm publishes only through its trusted publisher.
  Before a package's next release, Andrew sets that up and allows publishing
  (browser 2FA); otherwise npm rejects with E403 `OIDC permission denied`.
- A first publish of a new package uses the temporary `NPM_TOKEN` secret of the
  `npm-publish` environment. Revoke it after the read-back passes.

## After a publish

Add the dry run's manifest to `releases/` as `<hex>.json`, for its release id
`muxui-portfolio:<hex>`, byte for byte, with a row in `releases/README.md`. Name
it as `prior-release` in the next dry run.

## Recovery from a partial publish

The failed run prints a recovery plan and runs none of it.

- `healthy` (candidate bytes and provenance on npm): stays published.
- `bad-bytes`: deprecate with Andrew's yes, then fix forward at the next rc.
- `unverified` (not shown yet, unreadable, or no provenance): re-check later.
  Never republish that version, and deprecate nothing until its state is known.
- Fix forward is a new dry run at versions npm does not hold yet.

## Guards

- `.github/workflows/npm-publish.yml`
- `tooling/audits/repository-policy/publish-set.json`
- `tooling/audits/repository-policy/src/release-set.mjs`,
  `release-prepare.mjs`, `release-proof.mjs`, `release-lineage.mjs`,
  `release-manifest.mjs`
- `tooling/audits/repository-policy/src/npm-publication.mjs` (preflight,
  publish, read-back, recovery plan)
