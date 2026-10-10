# Decision 0010: React and React Native default starting points

Status: Accepted; edited to say what is still true (Decision 0027, Decision 0028).

Acceptance: Andrew / `ndrewtran` accepted the Decision 0010 authority choice in
issue #60 from proposal manifest
`sha256:1929d9bfaec1585092698eb95d544a62bdf4e0a78006f719558b06d77e497bf2`;
issue #60 records the Decision-only materialization disposition.

## Decision

1. React Aria Components is the default internal starting point for Mux UI React.
2. React Native Core primitives are the default internal starting point for Mux UI React Native.
3. Mux UI continues to own every public contract, including component inventory, APIs, types, behavior, accessibility requirements, styling hooks, lifecycle, and supported-platform claims.
4. For React Native, exceptions and additional native dependencies are evaluated and approved per component when that track activates.

This decision authorizes no implementation, dependency installation, component work, support claim, package publication, release change, or production change.

## Product Scope and release effect

Product Scope commitments, platform commitments, package responsibilities, support claims, and release boundaries do not change. This decision records an internal starting-point preference only.

## Non-goals

- Do not admit the React Aria component list as Mux UI's component inventory.
- Do not infer a React Native counterpart, parity claim, or support claim from a React component or its substrate.
- Do not select community or platform-native dependencies across the whole React Native package.
- Do not implement verifier machinery, evidence-continuation generation, dependency changes, exhaustive negative fixtures, or component-specific substrate evaluations in this authority-only stage.
- Do not change delivery status, milestone readiness, Project state, package publication, or release state.

## Later implementation boundary

React implementation follows Decision 0028. React Native implementation begins only when that track is activated. For each native component, the implementation proposal must then confirm that the chosen substrate preserves the Mux UI-owned public contract and must separately evaluate React Native platform behavior, accessibility, lifecycle, compatibility, and any additional dependency. Those later decisions own their own proof and review requirements.

## Reversal

A successor decision may replace a substrate. Replacing it must preserve the Mux UI-owned public contract and follow the applicable compatibility, evidence, deprecation, and release rules.
