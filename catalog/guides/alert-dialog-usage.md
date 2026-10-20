# AlertDialog usage

Use AlertDialog to confirm an action that cannot be undone or that needs explicit acknowledgement. It is a modal alert, so keep it for decisions that need to stop the user.

## AlertDialog or an alternative

- Use AlertDialog when the user must confirm before the action goes ahead.
- Use [Dialog](/components/dialog/) for a task with several fields or a longer flow.
- Use [Toast](/components/toast/) to report a result without blocking the task.

## Writing the confirmation

- Name the object in the title, such as Delete Quarterly report?
- State the consequence in the description, such as The report and its 12 comments are deleted.
- Label the confirm action with the verb and the object, such as Delete report, beside a Cancel.
- Give a destructive confirm action the `danger` variant, as [Button](/components/button/) does for Delete in a confirmation. The Close part with text renders as a `neutral` Button, which suits Cancel.
- A confirmation that destroys nothing keeps the default `primary` variant.

## Common mistake

Asking Are you sure? with OK and Cancel. The user cannot tell what is lost or what OK does. Say it in the title and on the confirm action instead.

## Cancel and confirm

The Close part is a button in the dialog's close slot. It closes the dialog and does nothing else, so it works as Cancel. The action the dialog confirms is the application's own button, placed with the other actions and given its own handler. AlertDialog does not know what that action does or whether it has finished.

## Open state and outcomes

Control the open state from the application when the outcome of an action decides whether the dialog closes. Every close request, from Escape or from the Close part, reaches the open-change callback, and the dialog stays open until the application sets the open state to false. The AlertDialog with an asynchronous confirmation example ignores close requests while its request runs, closes the dialog when the request succeeds, and keeps it open with the failure shown inside it when the request fails. The [Behavior](#behavior) section lists how the dialog opens and closes, and the [API reference](#api-reference) lists the props Mux UI defines.
