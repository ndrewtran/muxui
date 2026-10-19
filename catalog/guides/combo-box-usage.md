# ComboBox usage

Use normalized item records and provide a label for filtered options.

## Text and selection

A ComboBox keeps the input text and the selected option as separate state. The option is identified by its ID, so give each item a stable ID and keep the ID, not the label, as the selection. If you control both, the application sets the text when an option is chosen and clears its own selected ID when the input is emptied. The Controlled text and selection example wires both. The [Behavior](#behavior) section lists the callbacks, and a named form submits the selected ID.
