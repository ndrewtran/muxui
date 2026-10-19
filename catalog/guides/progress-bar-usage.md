# ProgressBar usage

Use ProgressBar for communicating task progress. Keep its Mux UI-owned props and accessible name semantics intact.

## States

ProgressBar is indeterminate when `value` is omitted and determinate when it is a number, including zero. While indeterminate it shows the text Loading; otherwise it shows the percent of the range. The text is built in, so a translated `label` does not translate it. ProgressBar keeps no task state: the application changes `value` and decides what to show once the work finishes. The ProgressBar states example compares waiting, not started, in progress, and complete.
