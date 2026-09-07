# Mux UI documentation

This private Astro Starlight app will host the Mux UI documentation surface.

Run these commands from the repository root:

```sh
pnpm --filter @muxui/docs check
pnpm --filter @muxui/docs build
pnpm docs
```

Documentation content lives in `src/content/docs/`. The site is a projection
over canonical catalog and guide sources; it does not own component facts.
