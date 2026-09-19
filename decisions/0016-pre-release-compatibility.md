# Decision 0016: current-only pre-release compatibility

- Status: accepted
- Decision owner: Andrew
- Effective: 2026-09-19
- Change record: PR #144
- Scope: superseded Mux-owned product interfaces during the current pre-release state

## Decision

Andrew confirmed that no projects consume Mux UI and directed removal of
compatibility aliases and similar artifacts for superseded values. He also
explicitly directed that historical query support be ignored while Mux UI is
in its pre-release state and authorized implementation of this cleanup.

The current product accepts current contracts only. Remove obsolete Button
spellings/tone, redundant compatibility tokens, saved-setting coercions,
historical query responses/notice diagnostics, and old source/descriptor
migrators. Update internal consumers, canonical documentation, generated
projections, and current tests together. Normal semantic token composition,
current version/integrity checks, platform fallbacks, accessibility obligations,
and the newly expanded React capabilities remain required.

## Authority and scope effect

This supersedes the active requirement to retain query API v1.1/v1.2 and its
notice-release window. Product Scope advances from 9.0.0 to 10.0.0 because the
committed historical query surface is removed. SCOPE-API-DEPRECATION,
SCOPE-PKG-SCHEMA, SCOPE-PKG-CATALOG, SCOPE-SURFACE-API, SCOPE-TRUST-HISTORY,
and the existing token/API scope retain their identities; no component family,
platform, package, or release capability is added or activated.

Compatibility windows and migration support are obligations of supported
published consumer contracts. They do not justify retaining superseded shapes
in the current pre-release product. Historical decisions and retained evidence
remain immutable and do not imply that their obsolete runtime interfaces must
remain executable. Current code must reject unsupported inputs explicitly.

## Delivery and proof

Deliver through PR #144 with focused schema, token, catalog, tooling, React,
Scale, docs, consumer, and generation checks plus independent review. No
completed milestone is reopened and no historical evidence is reinterpreted as
current proof. No Project status or release claim changes. Rollback is an
ordinary source revert before publication; no external consumer migration is
needed. This decision authorizes the cleanup and its documentation, not a
merge, package publication, deployment, or production mutation.
