# ProgressBar usage

Use ProgressBar for communicating task progress. Keep its Mux UI-owned props and accessible name semantics intact.

## ProgressBar or an alternative

| The measure | Use |
| --- | --- |
| How far a task has got, or that it is waiting, on a bar | ProgressBar |
| Progress in a compact space, such as beside a Button | [ProgressCircle](/components/progress-circle/) |
| A reading that is not a task, such as storage used | [Meter](/components/meter/) |

## Labels and status text

- Name the task on the bar and keep that label the same from start to finish, such as Upload report.
- Write the phase and the result in text beside the bar, such as Waiting for the server, Uploading, and Uploaded. The application owns that text.
- Leave the value text alone. The bar shows Loading while indeterminate and the percent otherwise.

## Common mistake

Changing the label with the phase, from Uploading to Uploaded. The label names the task, not its progress, so a label that changes stops naming the same thing. Keep the label and write the phase in the text beside it.

## States

ProgressBar is indeterminate when `value` is omitted and determinate when it is a number, including zero. While indeterminate it shows the text Loading; otherwise it shows the percent of the range. The text is built in, so a translated `label` does not translate it. ProgressBar keeps no task state: the application changes `value` and decides what to show once the work finishes. The ProgressBar states example compares waiting, not started, in progress, and complete, each with a stable label and its phase in the text beside it.
