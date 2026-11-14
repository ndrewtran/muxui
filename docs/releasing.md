# Releasing

Publishing, a dist-tag change, deprecation and unpublishing each need Andrew's
explicit yes for that exact release. Nothing else here publishes.

Every release publishes all four packages (schema, catalog, tooling, React) at
their next rc. Each version is `<source version>-rc.N`: the rc after the
registry's `next`, or `rc.1` of a strictly higher base. `@muxui/react` stays
`0.1.0-rc.N`. npm provenance records each release's source commit.

## Prepare locally

`pnpm release:prepare` runs the full check graph, `pnpm generate:check` and the
candidate packing and consumer matrix. It never publishes. Set
`MUXUI_RELEASE_VERSIONS=@muxui/schema=<v>,@muxui/catalog=<v>,@muxui/tooling=<v>,@muxui/react=<v>`
to pack exact versions; without it each package packs as its source `rc.1`.

## Dry run

Dispatch it on `main` at the release commit; only a main dry run can be
promoted. It preflights the four versions against the registry, then reuses
main's green CI run for the same commit, or runs the full `pnpm release:prepare`.

```sh
gh workflow run npm-publish.yml --ref main -f mode=dry-run \
  -f schema-version=<x.y.z-rc.N> -f catalog-version=<x.y.z-rc.N> \
  -f tooling-version=<x.y.z-rc.N> -f version=0.1.0-rc.N
```

- The run uploads the `npm-candidate` artifact (four tarballs plus
  `muxui-portfolio.release-manifest.json`, kept 30 days). Its step summary lists
  each tarball's sha512.
- `mode=registry-preflight` only reads the registry for the four versions.

## Publish

```sh
gh workflow run npm-publish.yml --ref main -f mode=publish \
  -f dry-run-id=<dry run id> -f tarball-sha512=<sha512-...,sha512-...,sha512-...,sha512-...> \
  <the same four version inputs>
```

The publish run re-verifies that dry run's artifact and never rebuilds. It
preflights the registry, publishes to `next` in order (schema, catalog, tooling,
React) with provenance, and reads each package back. Then it installs the four
versions from the registry in a clean project, checks each against its sha512,
and runs `npm audit signatures`: every attestation must name those bytes, the
release commit and `npm-publish.yml` on `main`. The first failure stops the
set. `mode=publish` runs only from `main`.

- A package that exists on npm publishes only through its trusted publisher.
  Before a package's next release, Andrew sets that up and allows publishing
  (browser 2FA); otherwise npm rejects with E403 `OIDC permission denied`.
- A first publish of a new package uses the temporary `NPM_TOKEN` secret of the
  `npm-publish` environment. Revoke it after the read-back passes.

## Recovery from a partial publish

The failed run prints a recovery plan and runs none of it. Recovery is the next
four-package release, prepared from what the registry holds:

- `not-attempted`: the next release keeps that version.
- `healthy` (candidate bytes and provenance on npm): stays published; the next
  release moves it to its next rc.
- `bad-bytes`: deprecate with Andrew's yes, then move to the next rc.
- `unverified` or `unattested`, or a failed post-publication check: stop.
  Re-check the registry until the state is known. Never republish a version,
  and deprecate nothing until then.

When every package is settled, the plan prints the next
`MUXUI_RELEASE_VERSIONS`; dispatch a new dry run with those versions.

## Guards

- `.github/workflows/npm-publish.yml`
- `tooling/audits/repository-policy/publish-set.json`
- `tooling/audits/repository-policy/src/release-set.mjs`,
  `release-prepare.mjs`, `release-proof.mjs`, `release-lineage.mjs`,
  `release-manifest.mjs`
- `tooling/audits/repository-policy/src/npm-publication.mjs` (preflight,
  publish, read-back, post-publication check, recovery plan)
