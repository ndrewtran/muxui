---
id: muxui:guide:foundations-motion
---

# Motion

Motion tokens pair finite durations with typed easing values and transition compositions for interaction, reveal, dismissal, resizing, modal entry and exit, progress, and mode changes. The source declares full and reduced motion. Reduced motion is a supported mode, not a separate visual theme.

Mux transitions run Motion spring curves by default. Read the role's transition composite, not its raw duration and easing, so a transition gets the spring with no override of its own.

Use a purpose-specific transition. Replay the explorer specimens with the button to see one finite movement; no motion starts automatically.

Token contract `5.0.0` exports the canonical reference durations `reference.motion.duration-instant` (0ms), `-fast` (120ms), `-moderate` (180ms), `-slow` (300ms), and `-deliberate` (500ms), plus structured easing tokens and semantic transition compositions. The older `reference.duration.*` names were removed because no Mux UI consumer used them. Update explicit authoring and CSS references to the `reference.motion.*` names.

The raw `reference.motion.duration-fast` reference is fixed at 120ms. Semantic roles such as `semantic.motion.feedback-duration` use that primitive in full motion and switch to `reference.motion.duration-instant` in reduced motion. Use the semantic role when that mode behavior is required.

`semantic.motion.feedback` and the unused generic roles `feedback-easing`, `state-easing`, `enter-duration`, `enter-easing`, `exit-easing`, `content-duration`, and `content-easing` were removed. Use `semantic.motion.feedback-duration` or the role owned by the entering, exiting, feedback, or content component. Equal current durations do not make roles interchangeable.

Preserve reduced-motion behavior while migrating. Feedback, state, and exit durations use Fast in full motion and Instant in reduced motion. Exact duration matches can share a reference primitive while keeping each role's existing reduced branch. Keep the purpose-specific 150ms interaction, 200ms reveal, 600ms content resize, 1000ms spinner, 1200ms sweep, and 1500ms travel roles. Feedback, selection-enter, panel-enter, and mode-toggle have no transition composite of their own: route feedback to the state, reveal, or dismiss composite by intent, and route entering selection popovers, panels, and the color-mode toggle to the reveal composite. Progress reduced motion is its own behavior and must not be implemented as a duration-zero shortcut.

Transition tokens reference the existing duration IDs so each timing is authored once. A transition that declares a spring names no easing, because its easing is the spring's own `linear()` curve; a transition without a spring still references an easing token. A role's perceived duration is the `visualDuration` of its spring. The interaction, state, dismiss, reveal, content-resize, modal, and modal-dismiss roles each carry a bounce-0 spring that the compiler turns into a deterministic CSS settle duration and `linear()` curve derived from Motion 13.4.0. For those roles `--muxui-semantic-motion-<role>-transition`, `-transition-duration`, and `-transition-easing` resolve to that role's own settle duration and curve, and no role borrows another role's curve. The same values are exposed as `-transition-spring-duration` and `-transition-spring-easing`; `-transition-spring-visual-duration` and `-transition-spring-bounce` keep the perceived timing that JavaScript springs run, and the base `<role>-duration` tokens stay perceived. The progress roles keep their own duration and easing, and the `progress-spin`, `progress-sweep`, `progress-travel`, and `constant-easing` loops do not change.

A theme that retimes a role overrides its perceived duration, for example `semantic.motion.interaction-duration`, or the `bounce` of its transition token through the theme authoring/compiler path. Compilation regenerates the settle duration and curve, so the composite stays coherent with the spring. A transition override must keep its record's shape: it cannot drop a declared spring or add an easing reference to one. The reveal, dismiss, and modal easing tokens (`semantic.motion.reveal-easing`, `dismiss-easing`, and `modal-easing`) were removed because no spring composite read them, so a theme that overrides one is rejected as an unknown token. `semantic.motion.interaction-easing` stays for determinate progress interpolation, and `progress-easing` and `constant-easing` stay for the progress roles and loops. A raw CSS override of a base duration or easing variable cannot recalculate the derived spring pair, so it does not reach the CSS composite. The `-transition` shorthand composes the role's own `-transition-duration` and `-transition-easing` parts, so an override of a part reaches the shorthand and the parts alike wherever that override is declared on the element that declares the composite, normally the document root or a mode scope. A custom property resolves where it is declared, so in a nested scope an override of one part does not recompute a shorthand declared above it. To retime a nested scope, override that scope's `-transition-duration`, `-transition-easing`, and `-transition-spring-visual-duration` for the role, and read the `-transition-duration` and `-transition-easing` parts in declarations, as below.

```css
.popover {
  transition:
    opacity var(--muxui-semantic-motion-reveal-transition-duration)
      var(--muxui-semantic-motion-reveal-transition-easing);
}

@media (prefers-reduced-motion: reduce) {
  .popover { transition-duration: var(--muxui-reference-motion-duration-instant); }
}
```

In reduced motion the roles that already collapse to Instant (state, dismiss, modal, modal-dismiss) also zero their compiled settle duration and use a `linear` curve. The interaction, reveal, and content-resize roles keep their authored values in the reduced token block, as before.

The generated theme resolves the requested motion mode and the browser controller respects the user's reduced-motion preference. Keep focus, state, progress, and content changes understandable when movement is shortened or removed.

Common mistake: using an indeterminate loop to demonstrate a token, assigning a slow content duration to a small control, or flattening all reduced motion to zero. Choose the motion role by purpose, keep replays finite, and preserve the documented reduced behavior.
