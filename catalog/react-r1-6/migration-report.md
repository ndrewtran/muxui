# Tale to Mux migration

This is the one-time implementation record for Decision 0013. Mux owns the
resulting design system and may evolve independently after this transfer.

## Delivered scope

- The existing 53 React component families plus 21 additional Tale React
  Aria-based families. TextEditor and Markdown have isolated entry points.
- Mux-owned colors, palette families, light/dark modes, typography roles and
  scales, spacing, shapes, effects, motion, and themes. Inter, Playfair Display,
  and Roboto Mono ship with their font licenses.
- Component CSS and meaningful interaction behavior transferred into Mux
  sources, with current catalog examples and Storybook stories.
- Private Scale theme authoring, including editing, preview, JSON import and
  export, local save/load, and stale-write rejection. Preview and export use
  the same Mux token compiler.
- An optional Tailwind consumer build adapter. Tailwind is not the Mux styling
  engine or a Mux runtime or peer dependency.

Tale remains a pinned reference, not a package, build, or synchronization
requirement. The shared token compiler remains independent of React and DOM
runtime objects; this work does not activate additional platform renderers.

## Material adaptations

Mux retains its own public component API and serializable values. The transfer
also corrects confirmed defects: accessible names and error relationships,
enabled control text contrast (including dark danger-ghost buttons), read-only selection behavior, controlled payment formatting, indeterminate
progress semantics, and scoped editor shortcuts. Editor images use durable
URLs through the existing consumer callback or URL prompt so saved documents
do not contain temporary browser object URLs. Scale preview/export and shadow
override consistency use a single source of truth.

The initial light/dark comparison covered the applicable component inventory
and guided styling fixes. Representative visual review and ordinary Mux
interaction checks are the delivery verification; incidental DOM differences
and subpixel raster differences are not maintained as permanent constraints.
The detailed donor fixtures remain optional migration diagnostics.

## Validation

Final workspace validation and delivery review are in progress. Successful
commands and remaining limitations will be recorded here before delivery.

## Future changes

Edit the Mux component, token, theme, and catalog sources, regenerate their
normal projections, and run the relevant Mux tests. Future design changes do
not require fresh Tale captures, updated donor difference records, exhaustive
classifications, or screenshot replay. Historical reference artifacts remain
unchanged.
