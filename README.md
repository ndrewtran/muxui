# Mux UI

Mux UI is a React design system and component library. Canonical catalog records
for components, blocks, guides and tokens compile into the React package's
generated guidance, a query catalog, the `muxui` CLI, a docs site and Storybook.

## Published packages

All four are release candidates on npm's `next` tag. Install with `@next`.

| Package | What it is |
|---|---|
| `@muxui/react` | React components, `styles.css`, and the optional theme stylesheets `themes.css` (text colour by WCAG 2 contrast ratio) and `themes-apca.css` (by APCA endpoint selection) |
| `@muxui/schema` | Source and response schemas, types and validation |
| `@muxui/catalog` | The compiled catalog and its query API |
| `@muxui/tooling` | The `muxui` CLI: `manifest`, `list`, `search`, `get` |

```sh
pnpm add @muxui/react@next react react-dom
pnpm add -D @muxui/catalog@next @muxui/tooling@next
```

`releases/README.md` lists the published releases.

## Private

- `@muxui/tokens`: token transforms. Token data ships inside the catalog bundle.
- The catalog compiler and the tooling authoring entry: workspace only.
- `apps/docs` (Astro Starlight), `apps/react-storybook`, `apps/scale` (theme
  editor), `apps/react-playground`, `tooling/generators/figma`.

## Prerelease posture

- Every export is experimental. There is no stable release, and `latest` is not
  claimed or promoted.
- Compatibility is current-only: superseded APIs are removed, not aliased.
- A bad release is deprecated and fixed forward with the next rc.

## Not claimed

- Assistive-technology support. Automated proof is axe in one browser plus
  keyboard and focus tests.
- Framework-free web, React Native, iOS, Android or React Native Web. Those
  bindings are `unsupported`.
- Stable support or cross-platform parity.

## Setup

Requires Node 24 (`.node-version`) and pnpm (`packageManager` in `package.json`).

```sh
pnpm install
pnpm generate
pnpm check
```

Generated projections are not committed; `pnpm generate` creates them, and
`pnpm check` and `pnpm check:all` bootstrap them. `pnpm docs`, `pnpm storybook`
and `pnpm scale` start the private apps.

Agents start at `AGENTS.md`. Product facts are in `ARCHITECTURE.md` and
releasing is in `docs/releasing.md`.
