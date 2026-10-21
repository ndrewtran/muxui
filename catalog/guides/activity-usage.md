# Activity usage

Use Activity to list the statuses of several tasks as dense rows. The application owns the tasks: it runs them, and passes Activity each task's status. Activity runs nothing and simulates nothing.

## Activity or an alternative

- Use Activity for a list of tasks that each have a status, such as the steps of a workspace check.
- Use [ProgressBar](/components/progress-bar/) for how far one task has got.
- Use [Toast](/components/toast/) to report one result that needs no follow-up.

## Content

- Label each item with the task, such as Prepare the release notes. Activity shows the status word beside it, so leave the status out of the label.
- Use `meta` for a short count or size, such as 4 pages, and `time` for a duration, such as 5s, which follows the status as in 5s.
- Put the reason for a failure in `details`, and a way to recover in `actions`.
- Label the group with the work as a whole, such as Workspace checks. Leave `status` out to let the group follow its items: `failed` first, then `running`, `queued`, `cancelled`, and `completed`.

## Common mistake

Expecting Activity to update on its own. It renders the statuses it is given, so change an item's status in your own state when its task starts, finishes, or fails.

The [Behavior](#behavior) section lists how the group and its rows open and close, and the [API reference](#api-reference) lists the props Mux UI defines.
