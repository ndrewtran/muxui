# Dialog usage

Give Dialog a title or explicit accessible name and let React Aria manage inertness, focus, dismissal, and focus restoration behind the Mux UI API.

## Dialog or an alternative

- Use Dialog for a step that holds the page until the user is done, such as reviewing changes or editing a few fields.
- Use [AlertDialog](/components/alert-dialog/) to confirm an action that cannot be undone or that needs explicit acknowledgement.
- Use [Popover](/components/popover/) for content tied to a trigger that the user can leave without finishing.

## Content

- Title the Dialog with the task, such as Rename report.
- Label each action with its result, such as Save and Cancel.

## Dismissal and unfinished work

A Dialog is dismissable by default, so Escape, an outside press, and a close button all close it.

- Keep the default unless closing would lose data or interrupt a pending side effect, such as unsaved edits or a running save.
- When you suppress dismissal, give the Dialog a named exit in the close slot, such as Cancel or Discard changes.

The Dialog with unsaved changes example renames a report. While the name is unchanged, Escape and an outside press close the Dialog. Once the name changes, only Discard changes and Save close it. While the save runs, the field is read-only and the Dialog stays open until the save finishes.

## A Dialog that is not dismissable

A Dialog that is not dismissable ignores Escape, outside presses, and its trigger, and it renders no close button of its own, so give it a button in the close slot. That button closes an uncontrolled Dialog directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Dialog example shows one Dialog of each kind. The [Behavior](#behavior) section lists the details.

## Common mistake

Turning off dismissal on every Dialog to be safe. A user who opens one by mistake then has no quick way out. Suppress dismissal only while closing would lose data or interrupt work.
