# Decision 0011: R1 React delivery reset

- Status: accepted; edited to say what is still true (Decision 0027, Decision 0028)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0011`
- Accepted request: [acceptance record](./0011-r1-react-delivery-reset-acceptance.md)

## Decision

Mux UI delivers React as an ordinary React library.

- Mux UI owns every public component contract. React Aria Components is an
  internal replaceable substrate. Mux UI styling was a one-time implementation
  baseline and is never a dependency or a live owner.
- React comes first. Framework-free web, React Native, React Native Web,
  cross-renderer equivalence, RSC and client-boundary support, stable support,
  and `latest` remain later or separately admitted work.
- Every family committed to the React `0.1` boundary is Mux UI-owned and
  export-ready by the R1 exit.

## Delivery controls that do not exist

None of these is a prerequisite for a component, evidence, Git, pull-request,
protected merge, cleanup, or Project operation: a continuous-execution
envelope, manifest, receipt, or bootstrap; a task-local `ChangeIntentEnvelope`
or operation descriptor; a delivery profile, delivery packet, applicability
successor, evidence-continuation record, historical-byte compatibility bridge,
or digest-bound transition receipt; or separate human acceptance of a tranche
lock, component contract, retained evidence packet, routine Git operation,
intermediate merge, or Project status change.

## Ordinary delivery contract

Initial Mux UI-owned API and implementation design inside a committed family or
an experimental family is ordinary delivery work, not a product decision.
Decision 0028 states which work needs a decision. Each bounded pull request
must:

1. change the earliest canonical owners and regenerate their projections;
2. preserve the Mux UI-owned public boundary and keep React Aria internal;
3. apply component styling to Mux UI-owned CSS and token hooks without adding
   an external styling dependency;
4. expose completed work in the private React playground;
5. run focused type, unit, render, CSS, accessibility, generation, and packed
   consumer checks proportional to the exported behavior;
6. receive the repository's normal protected CI and review-bot coverage; and
7. merge only through the protected pull-request workflow when current-head
   checks and reviews are green.

Interactive controls add focused keyboard, focus, state, form, and browser
checks. Composite, collection, overlay, temporal, announcement, or destructive
behavior adds the manual or assistive-technology review its actual risk names
before export. Non-React components are outside R1 and require no R1
accessibility review. Unchanged shared facts are not reproved per component.

Evidence is retained from the tests and reviews that actually deliver the work.
It needs no separate human evidence-acceptance message. Comprehensive
cross-package, packed-consumer, accessibility, compatibility, and release proof
is assembled at the React prerelease boundary.

A moving `main`, a regenerated projection, a routine test correction, or a
verified review finding does not by itself stop work. Rebase or rebuild the
branch, rerun the relevant checks and current-head review, and continue while
the product meaning and the stop boundaries stay unchanged.

## Stops

Work stops for Andrew only on the stops in Decision 0028. They include npm
publication, any dist-tag mutation, and the final R1-exit pull-request merge.

## Non-goals

This decision does not itself implement a component, publish a package, claim
support, deploy, or mutate production. The Delivery Project stays mutable
execution state. It cannot change scope, support, evidence meaning,
publication, or release authority.
