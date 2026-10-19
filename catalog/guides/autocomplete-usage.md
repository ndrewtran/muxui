# Autocomplete

Use `label` or an explicit `aria-label`/`aria-labelledby` name. Suggestions are filtered by the Mux UI input value and open in a non-modal, anchored portal below the input without shifting surrounding content. The overlay closes on Escape, outside interaction, or selection, and its list scrolls when it exceeds the available viewport space. `items` accept strings or `{id, label, value}` records; `onSelect` receives the Mux UI record.

## In a form

Give Autocomplete a name to submit it with a form. The form receives the selected suggestion's value, or the typed text when nothing was selected, while the input shows the suggestion's label. The Autocomplete in a form example reads the selection and the submitted value.

Escape and Enter act on the open suggestion list before the field and the form: Escape closes the list and keeps the text, and Enter selects the highlighted suggestion without submitting. The [Behavior](#behavior) section lists what each key does with the list open and closed.
