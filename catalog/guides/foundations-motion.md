---
id: muxui:guide:foundations-motion
---

# Motion

Motion tokens pair finite durations with easing strings for interaction, reveal, dismissal, resizing, progress, and mode changes. The source declares full and reduced motion. Reduced motion is a supported mode, not a separate visual theme.

Use a purpose-specific duration and easing. Replay the explorer specimens with the button to see one finite movement; no motion starts automatically.

Token contract `4.0.0` exports the canonical reference durations `reference.motion.duration-instant` (0ms), `-fast` (120ms), `-moderate` (180ms), `-slow` (300ms), and `-deliberate` (500ms). The older `reference.duration.*` names were removed because no Mux UI consumer used them. Update explicit authoring and CSS references to the `reference.motion.*` names.

The raw `reference.motion.duration-fast` reference is fixed at 120ms. Semantic roles such as `semantic.motion.feedback-duration` use that primitive in full motion and switch to `reference.motion.duration-instant` in reduced motion. Use the semantic role when that mode behavior is required.

`semantic.motion.feedback` and the unused generic roles `feedback-easing`, `state-easing`, `enter-duration`, `enter-easing`, `exit-easing`, `content-duration`, and `content-easing` were removed. Use `semantic.motion.feedback-duration` or the role owned by the entering, exiting, feedback, or content component. Equal current durations do not make roles interchangeable.

Preserve reduced-motion behavior while migrating. Feedback, state, and exit durations use Fast in full motion and Instant in reduced motion. Exact duration matches can share a reference primitive while keeping each role's existing reduced branch. Keep the purpose-specific 150ms interaction, 200ms reveal, 600ms content resize, 1000ms spinner, 1200ms sweep, and 1500ms travel roles. Progress reduced motion is its own behavior and must not be implemented as a duration-zero shortcut.

```css
.popover {
  transition:
    opacity var(--muxui-semantic-motion-reveal-duration)
      var(--muxui-semantic-motion-reveal-easing);
}

@media (prefers-reduced-motion: reduce) {
  .popover { transition-duration: var(--muxui-reference-motion-duration-instant); }
}
```

The generated theme resolves the requested motion mode and the browser controller respects the user's reduced-motion preference. Keep focus, state, progress, and content changes understandable when movement is shortened or removed.

Common mistake: using an indeterminate loop to demonstrate a token, assigning a slow content duration to a small control, or flattening all reduced motion to zero. Choose the motion role by purpose, keep replays finite, and preserve the documented reduced behavior.
