---
id: muxui:guide:foundations-motion
---

# Motion

Motion tokens pair finite durations with easing strings for interaction, reveal, dismissal, resizing, progress, and mode changes. The source declares full and reduced motion. Reduced motion is a supported mode, not a separate visual theme.

Use a purpose-specific duration and easing. Replay the explorer specimens with the button to see one finite movement; no motion starts automatically.

Token contract 3.0.0 removes the Quick duration primitives and legacy Quick semantic roles. Theme authoring documents must use `tokenContractVersion: "3.0.0"`. Migrate `reference.duration.quick` to `reference.duration.fast` and `reference.motion.duration-quick` to `reference.motion.duration-fast` (Fast, 120ms). Replace `semantic.motion.quick-transition-duration` and `--muxui-semantic-motion-quick-transition-duration` with `semantic.motion.state-duration` and `--muxui-semantic-motion-state-duration`; replace `semantic.motion.quick-feedback-duration` and `--muxui-semantic-motion-quick-feedback-duration` with `semantic.motion.feedback-duration` and `--muxui-semantic-motion-feedback-duration`. The feedback, state, and exit roles use Fast (120ms) and reduce to Instant (0ms) under reduced motion.

```css
.popover {
  transition:
    opacity var(--muxui-semantic-motion-reveal-duration)
      var(--muxui-semantic-motion-reveal-easing);
}

@media (prefers-reduced-motion: reduce) {
  .popover { transition-duration: 0ms; }
}
```

The generated theme resolves the requested motion mode and the browser controller respects the user's reduced-motion preference. Keep focus, state, and content changes understandable when movement is shortened or removed.

Common mistake: using an indeterminate loop to demonstrate a token or assigning a slow content duration to a small control. Choose the motion role by purpose, keep replays finite, and make reduced motion safe.
