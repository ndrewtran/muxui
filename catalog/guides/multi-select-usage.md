# MultiSelect usage

Give MultiSelect a label or an accessible name. Items have serializable IDs, and the selection is a set of those IDs, or all of them.

## In a form

MultiSelect is not a native select. It renders no form input, so a surrounding form does not submit it. Keep the selection in controlled state and serialize the selected IDs when the form submits, expanding the all selection to every item ID first. Required adds an asterisk to the label; it does not check that anything is selected, so the application does. The MultiSelect in a form example does both.

## Reset and Select all

The Reset and Select all buttons only call their callbacks. They change no selection themselves, so they have no effect on an uncontrolled selection. A controlled selection applies them by setting the new selection in the callbacks.

## Text and language

The search field's label and placeholder and the Reset, Select all, and Clear search buttons use fixed English text. The label, placeholder, selection summary, and empty-state text come from props. The [API reference](#api-reference) lists the props.
