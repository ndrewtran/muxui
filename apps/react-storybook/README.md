# Private Mux UI React Storybook

This is a private development showcase for the standalone `@muxui/react`
renderer. Storybook 10.5.10, `@storybook/react-vite` 10.5.10, and the
`@storybook/addon-a11y` 10.5.10 integration are pinned to the workspace's
React 19.2.8 and Vite 8.2.1 baseline.

The generator reads the Mux UI-owned React descriptor and the canonical R1 family
snapshot. It emits one tracked package-owned CSF story module per family. The
sidebar presents component families alphabetically, while each story retains its
R1 tranche metadata and deep-link ID. The explicit
renderer adapters are checked against that descriptor so the private projection
cannot silently gain or lose a family.

```sh
pnpm --filter @muxui/react-storybook storybook
pnpm --filter @muxui/react-storybook check
pnpm --filter @muxui/react-storybook build
```

Direct package checks run the complete browser audits. CI may set
`MUXUI_STORYBOOK_AUDIT_MODE=skip-heavy` for a pull request whose changed paths
are outside the Storybook dependency closure; the canonical selector fails
closed to full coverage for unknown or shared inputs. The colour audit uses
two isolated browser contexts by default. The a11y audit defaults to one worker
while its full two-worker run is being hardened; set
`MUXUI_STORYBOOK_A11Y_WORKERS=2` for an explicit comparison. Set
`MUXUI_STORYBOOK_COLORS_WORKERS=1` to run the colour audit serially when
comparing timings.
