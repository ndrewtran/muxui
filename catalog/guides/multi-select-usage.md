# MultiSelect usage

Give MultiSelect a label or an accessible name. Items have serializable IDs, and the selection is a set of those IDs, or all of them.

## In a form

MultiSelect is not a native select. It renders no form input, so the application serializes the selected IDs when the form submits, expanding the all selection to every item ID first. Required adds an asterisk but does not check the selection. The Reset and Select all buttons only call their callbacks, so a controlled selection applies them and an uncontrolled one ignores them. The MultiSelect in a form example does all three. The [Behavior](#behavior) section also lists what Escape does and which text is fixed English, and the [API reference](#api-reference) lists the props.
