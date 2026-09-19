---
id: muxui:guide:lifecycle
---

# Lifecycle

Every component and example carries a lifecycle from the canonical catalog.
Current React bindings are `experimental`; component pages surface that status
next to the platform binding.

Experimental means the API, styling, accessibility, and compatibility contract
is still under active proof. Use the exact package and catalog tuple selected by
your project rather than assuming a hosted latest version.

Lifecycle status is separate from implementation strategy and evidence. A
binding can be implemented while its support claim remains unproved. The docs
site presents the recorded status and does not promote a component to stable.

## Release boundary

The current product boundary is a React prerelease. Stable promotion,
framework-free web support, React Native support, cross-platform equivalence,
and public catalog or CLI publication require their own activation and proof.

## Pre-release compatibility

Mux UI currently has no consuming projects. Superseded Mux-owned props, tokens,
and saved/query formats are removed directly, with internal callers and docs
updated together. No compatibility alias, notice window, or old-format migrator
is retained solely for an obsolete pre-release value. Current validation and
platform support remain required; historical evidence remains unchanged.
Supported published contracts will declare their compatibility obligations.
