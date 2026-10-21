# SelectNative usage

SelectNative renders a visible native select, so options, option groups, multiple selection, keyboard handling, form submission, and reset are the browser's own. Give it a label or an accessible name.

## SelectNative or Select

- Use SelectNative when the field needs the browser's own select behavior: native options and groups, several values, visible rows, or form reset.
- Use [Select](/components/select/) when the options or the trigger need rich content. Its guide compares the two, and points to [ComboBox](/components/combo-box/) for filtering a long list.

## Values and change events

The change callback receives the native React change event, so read the value from the event's current target and store that, not the event. A multiple select takes and reports an array of option values. The Controlled SelectNative example does both with typed handlers.

## Size and forms

A named size sets the visual size, while a number sets the native count of visible rows. A named multiple select submits one entry per selected option, so read them with `FormData.getAll`. A nonempty error message makes the select invalid even when the invalid state is not set. The SelectNative in a form example shows a four-row multiple select, an error message, and a reset. The [Behavior](#behavior) section lists each rule, and the [API reference](#api-reference) lists the props Mux UI defines. The value, the change callback, and the other native select attributes pass through to the select.

## Content

- Options are native `option` and `optgroup` elements, so their content is plain text.
- SelectNative has no `placeholder` prop. Add a first option with an empty value for the unselected state, as the Basic React SelectNative example does.

## Common mistake

Reading `event.currentTarget.value` from a multiple select. It returns only the first selected value, so read the selected options instead, as the Controlled SelectNative example does.
