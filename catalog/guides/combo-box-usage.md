# ComboBox usage

Use normalized item records and provide a label for filtered options.

## Text and selection

A ComboBox holds two separate pieces of state: the text in the input, and the selected option. The text is what the user typed, or the label of the option they chose. The selected option is identified by its ID, so give each item a stable ID and keep the ID, not the label, as the selection.

When only the text is controlled, choosing an option calls the text callback with the option's label. When both are controlled, the application sets the text itself when an option is chosen. Emptying the input clears the selection without calling the selection callback, so the application clears its own selected ID too. The Controlled text and selection example wires both. A named form submits the selected ID. The [API reference](#api-reference) lists the props.
