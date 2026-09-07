# Tailwind consumer proof

This fixture is an isolated consumer build. Tailwind is a fixture-only development dependency; it is not a Mux UI runtime or peer dependency.

```sh
pnpm install --ignore-workspace --offline --ignore-scripts --frozen-lockfile
pnpm check
```

`check.mjs` imports the browser-safe Mux adapter, compiles an `@theme inline` layer with Tailwind 4.1.13, and checks the generated color, text, radius, font, weight, line-height, tracking, shadow, duration, easing, and consumer override hooks against the actual Mux component stylesheet.
