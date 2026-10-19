# ComboBox usage

Use normalized item records and provide a label for filtered options.

## Text and selection

A ComboBox keeps the input text and the selected option as separate state. The option is identified by its ID, so give each item a stable ID and keep the ID, not the label, as the selection. If you control both, the application sets the text when an option is chosen. Emptying the input calls `onSelect` with no item, so set the selected ID to `null` and the text to an empty string there. Pass `selectedId={null}` for a controlled field with no selection; an empty string is not an ID and throws. The Controlled text and selection example wires both. The [Behavior](#behavior) section lists the callbacks, and a named form submits the selected ID, or an empty value when nothing is selected.
