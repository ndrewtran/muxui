# Autocomplete

Use `label` or an explicit `aria-label`/`aria-labelledby` name. Suggestions are filtered by the Mux UI input value and open in a non-modal, anchored portal below the input without shifting surrounding content. The overlay closes on Escape, outside interaction, or selection, and its list scrolls when it exceeds the available viewport space. `items` accept strings or `{id, label, value}` records; `onSelect` receives the Mux UI record.

## Autocomplete or ComboBox

Choose by what the form should receive.

- Use Autocomplete when the typed text is a valid value on its own, such as a search term or a place that is not in the suggestions.
- Use [ComboBox](/components/combo-box/) when the field must hold a known record. It submits the selected item's `id`, or an empty value, never unmatched text.

The ComboBox and Autocomplete submitted values example, on the [ComboBox](/components/combo-box/) page, shows both over the same records.

## When nothing matches

Text that matches no suggestion closes the list without a message and stays in the field as typed.

- Leave the list silent when any text is valid, as in a search box.
- Add the message yourself when the user should notice that nothing matches. Set `invalid` and `errorMessage`, or `description`, from the text `onChange` reports.

The Autocomplete with no-match help example compares that text with the items.

## In a form

Give Autocomplete a name to submit it with a form. The form receives the selected suggestion's value, or the typed text when nothing was selected, while the input shows the suggestion's label. The Autocomplete in a form example reads the selection and the submitted value.

Escape and Enter act on the open suggestion list before the field and the form: Escape closes the list and keeps the text, and Enter selects the highlighted suggestion without submitting. The [Behavior](#behavior) section lists what each key does with the list open and closed.

## Content

- Label the field with what the text is, such as City, not Type here.
- A string item is submitted as its text. Give a record a `value` when the form should receive something else, such as a code.

## Common mistake

Assuming the submitted value is always one of your items. The user can submit any text, so check it where the value is used, or use ComboBox when only a known record is allowed.
