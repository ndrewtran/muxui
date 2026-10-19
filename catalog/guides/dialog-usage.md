# Dialog usage

Give Dialog a title or explicit accessible name and let React Aria manage inertness, focus, dismissal, and focus restoration behind the Mux UI API.

## Dialog and AlertDialog

Dialog presents modal content that holds the page until the user is done with it, such as a step that reviews changes. AlertDialog is the component declared for confirming an action that cannot be undone or that needs explicit acknowledgement, and its guidance lists routine choices, non-blocking notices, and forms with several fields as cases to avoid.

## A Dialog that is not dismissable

A Dialog that is not dismissable ignores Escape, outside presses, and its trigger, and it renders no close button of its own, so give it a button in the close slot. That button closes an uncontrolled Dialog directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Dialog example shows one Dialog of each kind. The [Behavior](#behavior) section lists the details.
