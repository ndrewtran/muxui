# ProgressCircle usage

Use ProgressCircle for progress in a compact space, such as beside a Button or in a tab. Give it a name with `label`, pass `value` as a number, and pass `null` while the length of the work is unknown.

## ProgressCircle or an alternative

| The measure | Use |
| --- | --- |
| Progress in a compact space, known or unknown | ProgressCircle |
| How far a task has got, with its name and percent on a bar | [ProgressBar](/components/progress-bar/) |
| A reading that is not a task, such as storage used | [Meter](/components/meter/) |

## Finishing an operation

- For a transient operation, such as a sync, show the circle while the work runs. When it ends, replace the circle with the result in your own status text, such as Synced 12 files.
- Do the same when the work fails or the user cancels it, with text such as Sync failed or Sync cancelled. Say what happened and what the user can do next.
- Keep a completed circle only where the measure stays useful afterward, such as a dashboard that shows how much of a plan is done.

The ProgressCircle for an operation example shows the first two: a circle with unknown progress, then status text in its place, whether the sync finishes, fails, or is cancelled.

## Content

- Name the task, such as Sync progress, with `label` or a Label part.
- Put the phase and the result in status text the application owns. The circle holds no task state.

## Common mistake

Passing `0` while the length of the work is unknown. Zero is a real value and draws an empty circle. Pass `null` for unknown progress.

The [Behavior](#behavior) section lists how values and motion work, and the [API reference](#api-reference) lists the props Mux UI defines.
