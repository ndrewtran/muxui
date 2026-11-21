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

## A sheet along the bottom edge

- Present a Dialog as a sheet for a short task on a narrow screen, where the bottom edge is in reach of a thumb. Keep it centred on wide screens.
- A sheet is the same Dialog: give it a title, and its actions and close button work as they do in the middle of the screen.
- A drag down from the grip or the title dismisses a sheet, as Escape, an outside press, and the close button do, and a drag up from them scrolls the sheet. The [Behavior](#behavior) section lists how far or how fast the drag must go.
- A sheet scrolls as one, so a long title, description, or content scrolls together, while the grip and the close button stay at the top and the actions at the bottom. The close button is a target of at least 44 pixels at the end of the top band. A drag that starts in the description or the content never moves the sheet.
- Focus moves into the sheet when it opens, Tab stays inside it, and closing returns focus to the trigger, as for a centred Dialog. Pressing the grip keeps focus, and the text selection, in a field.
- A sheet rises above an on-screen keyboard. To keep it clear of rounded corners and the home indicator on phones, set viewport-fit to cover in the page's viewport meta tag.
- With reduced motion, a sheet appears and leaves at once, shows no grip, and cannot be dragged. Escape, an outside press, and the close button still close it.
- A sheet that is not dismissable shows no grip and cannot be dragged, so give it a named exit in the close slot.
- A sheet renders after hydration, like any open Dialog: the server sends only its trigger.

The Dialog as a sheet example lists languages in a sheet: the list scrolls inside it, and Done, the close button, Escape, an outside press, or a drag down put it away.

## A Dialog that is not dismissable

A Dialog that is not dismissable ignores Escape, outside presses, and its trigger, and it renders no close button of its own, so give it a button in the close slot. That button closes an uncontrolled Dialog directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Dialog example shows one Dialog of each kind. The [Behavior](#behavior) section lists the details.

## Common mistake

Turning off dismissal on every Dialog to be safe. A user who opens one by mistake then has no quick way out. Suppress dismissal only while closing would lose data or interrupt work.
