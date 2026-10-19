# AlertDialog usage

Use AlertDialog to confirm an action that cannot be undone or that needs explicit acknowledgement. It is a modal alert, and its guidance lists routine choices, non-blocking notices, and forms with several fields as cases to avoid.

## Cancel and confirm

The Close part is a button in the dialog's close slot. It closes the dialog and does nothing else, so it works as Cancel. The action the dialog confirms is the application's own button, placed with the other actions and given its own handler. AlertDialog does not know what that action does or whether it has finished.

## Open state and outcomes

Control the open state from the application when the outcome of an action decides whether the dialog closes. Every close request, from Escape or from the Close part, reaches the open-change callback, and the dialog stays open until the application sets the open state to false. The AlertDialog with an asynchronous confirmation example ignores close requests while its request runs, closes the dialog when the request succeeds, and keeps it open with the failure shown inside it when the request fails. The [Behavior](#behavior) section lists how the dialog opens and closes, and the [API reference](#api-reference) lists the props Mux UI defines.
