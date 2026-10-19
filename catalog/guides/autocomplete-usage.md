# Autocomplete

Use `label` or an explicit `aria-label`/`aria-labelledby` name. Suggestions are filtered by the Mux UI input value and open in a non-modal, anchored portal below the input without shifting surrounding content. The overlay closes on Escape, outside interaction, or selection, and its list scrolls when it exceeds the available viewport space. `items` accept strings or `{id, label, value}` records; `onSelect` receives the Mux UI record.

## In a form

Give Autocomplete a name to submit it with a form. The form receives the value of the selected suggestion, or the typed text when no suggestion was selected, while the input shows the suggestion's label. The Autocomplete in a form example reads the chosen suggestion as it is selected and the submitted value from the form data.

While the suggestion list is open, Escape closes it and keeps the typed text, and Enter selects the highlighted suggestion without submitting the form. With the list closed, Escape clears the text. When no suggestion is highlighted, or the list is closed, Enter submits the form as usual. The [Behavior](#behavior) section lists each case.
