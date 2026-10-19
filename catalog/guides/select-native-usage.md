# SelectNative usage

SelectNative renders a visible native select, so options, option groups, multiple selection, keyboard handling, form submission, and reset are the browser's own. Give it a label or an accessible name.

## Values and change events

The change callback receives the native React change event for the select. Read the value from the event's current target and store that, not the event. A single select takes and reports a string value. A multiple select takes an array of option values, which you read from the select's selected options. The Controlled SelectNative example does both with typed handlers.

## Size

A named size sets the visual size. A number sets the native count of visible rows, and the select keeps its default visual size. Any other size is rejected.

## In a form

A named multiple select submits one entry per selected option, so read them with `FormData.getAll`. Resetting the form restores the default selection. A nonempty error message makes the select invalid and shows the message even when the invalid state is not set. The SelectNative in a form example shows a multiple select with four visible rows, an error message, and a reset. The [API reference](#api-reference) lists the props.
