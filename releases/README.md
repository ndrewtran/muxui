# Release ledger

Each file is the portfolio release manifest of one published release, byte for
byte as the npm publish workflow's dry run wrote it
(`muxui-portfolio.release-manifest.json` in its `npm-candidate` artifact).

A file is named `<hex>.json` for the release id `muxui-portfolio:<hex>`.
Release preparation reads only these files: `prior-release` names one of
them, and a reused package's origin is found by its release id.

| File | Published |
|---|---|
| `40dcc0032b7db3a47e19797d4e73bc9d.json` | schema 0.6.0-rc.1, catalog 2.1.0-rc.1, tooling 1.1.0-rc.1, react 0.1.0-rc.5 |
| `1adadbb095d9ebc1b63a0aae35c6a10c.json` | tooling 1.1.0-rc.2 (reuses the rest from rc.5) |
| `901c8c6dbc6a22e970b37a726594b286.json` | schema 0.6.0-rc.2, catalog 3.0.0-rc.1, tooling 1.1.0-rc.3, react 0.1.0-rc.6 |

After a publish, add its manifest here as `<hex>.json` and a row to this table.
