# @muxui/schema

The Mux UI schema package: JSON Schemas, stable artifact identifiers, error
codes, strict validation, canonical serialization, revision helpers, and
authoring helpers. `@muxui/catalog` and `@muxui/tooling` build on it.

## Status

This package ships only as `-rc.N` prereleases on the `next` dist-tag of npm.
Every export is experimental, and no stable or support claim is made. npm also
points `latest` at a package's first published version; that is not a stable or
`latest` support claim.

## Install

```sh
pnpm add @muxui/schema@next
```

It requires Node.js `>=24.19.0 <25`.

## Entries

| Entry | Holds |
| --- | --- |
| `@muxui/schema` | Constants, `validateFamily`, `canonicalJson`, `canonicalDigest`, revision and authoring helpers |
| `@muxui/schema/schemas/*` | The JSON Schema files, for example `@muxui/schema/schemas/query-envelope.schema.json` |
| `@muxui/schema/types` | TypeScript declarations for artifact references, error codes, and query response types |

No other path is part of the package.
