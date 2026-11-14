# @muxui/catalog

The compiled Mux UI catalog: component, pattern, token, and guide records in
one immutable bundle, with the transport-independent query API that reads it.
The package version equals the bundle's `catalogVersion`. It depends on
`@muxui/schema`.

## Status

This package ships only as `-rc.N` prereleases on the `next` dist-tag of npm.
Every export is experimental, and no stable or support claim is made. npm also
points `latest` at a package's first published version; that is not a stable or
`latest` support claim.

## Install

```sh
pnpm add @muxui/catalog@next
```

It requires Node.js `>=24.19.0 <27`.

## Entries

| Entry | Holds |
| --- | --- |
| `@muxui/catalog` | `createCatalogApi` and the manifest, list, search, and detail queries over the bundle |
| `@muxui/catalog/search` | The search query grammar helpers, with types |
| `@muxui/catalog/bundle` | The bundle as a JavaScript module (`catalogJson`) |
| `@muxui/catalog/catalog.json` | The bundle as JSON |
| `@muxui/catalog/catalog-package.json` | The package identity: catalog version, digest, and provenance |
| `@muxui/catalog/token-section-page-budget-profile.json` | The token section page budget profile |

The catalog compiler and its authoring checks are not part of the package.
