# MultiSelect usage

Give MultiSelect a label or an accessible name. Items have serializable IDs, and the selection is a set of those IDs, or all of them.

## In a form

MultiSelect is not a native select. It renders no form input, so the application serializes the selected IDs when the form submits, expanding the all selection to the IDs of the items that are not disabled first. Required adds an asterisk and the hidden text Required to the trigger's description, but does not check the selection. The Reset and Select all buttons change the selection themselves and report it through onSelectionChange, so a controlled selection changes only when the application applies the reported selection; onReset and onSelectAll are optional notifications. The MultiSelect in a form example serializes the selection and checks it on submit. The [Behavior](#behavior) section also lists what Escape does and which text is fixed English, and the [API reference](#api-reference) lists the props.
