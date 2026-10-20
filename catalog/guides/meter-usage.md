# Meter usage

Use Meter for showing a reading within a known range, such as storage used. Keep its Mux UI-owned props and accessible name semantics intact.

## Meter or an alternative

- Use Meter for a reading that is not a task, such as storage used or a score.
- Use [ProgressBar](/components/progress-bar/) for how far a task has got.
- Use [ProgressCircle](/components/progress-circle/) for task progress in a compact space.

## Content

- Name what is measured, such as Storage or Disk usage, not the reading.
- Set `minValue` and `maxValue` to the real range, so the fill and the percent read correctly.

## Common mistake

Using Meter to show a task's progress. A Meter shows a reading and has no waiting or complete state, so it cannot say that work has not started or has finished. Use ProgressBar for tasks.

## Value text

By default the value text is the value's position in the range as a percent, and the fill shows the same position. A `formatOptions` value that does not set the percent style formats the clamped value itself instead, while the fill still shows the position in the range. Numbers follow the default locale of the environment that renders them. The Meter with a custom range example shows both formats over one range.

## Naming a Meter

The `label` prop is the visible name and is required by the type, but Meter does not render it when `aria-label` or `aria-labelledby` is supplied. Meter then shows only its value text, so the application renders any visible label. The Meter with an external label example names a Meter with `aria-labelledby` and renders the label outside it.
