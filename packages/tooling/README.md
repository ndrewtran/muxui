# @muxui/tooling

The `muxui` command line and its programmatic API: parser, renderers, and the
resolver that reads a project's installed `@muxui/catalog` and renderer
packages. It depends on `@muxui/catalog` and `@muxui/schema`.

## Status

This package ships only as `-rc.N` prereleases on the `next` dist-tag of npm.
Every export is experimental, and no stable or support claim is made. npm also
points `latest` at a package's first published version; that is not a stable or
`latest` support claim.

## Install

```sh
pnpm add -D @muxui/tooling@next @muxui/catalog@next
pnpm exec muxui manifest
```

The command reads the `@muxui/catalog` the project declares; without one it
reports `MUXUI_CATALOG_NOT_DECLARED`. It runs inside a pnpm project (a
`pnpm-lock.yaml` and a `packageManager` of exactly `pnpm@10.33.0`) on Node.js
`>=24.19.0 <25`.

## Entries

| Entry | Holds |
| --- | --- |
| `muxui` (bin) | The command line |
| `@muxui/tooling` | `runCli`, `executeCommand`, `parseCliArguments`, and the dense, human, and JSON renderers |
| `@muxui/tooling/resolver` | `resolveCatalogGraph`, which checks a catalog and its renderers for compatibility |
| `@muxui/tooling/registry` | The generated command registry, help, and completion data |
| `@muxui/tooling/types` | TypeScript declarations for the query response types |

Maintainer authoring helpers (scaffolds, diagnostics, semantic diff) stay in
the Mux UI repository and are not part of the package.
