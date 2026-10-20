# Checkbox usage

Use Checkbox for selecting or clearing an option. Its children are the visible label.

## Mixed state

The mixed state is separate from the checked state. Checkbox shows it for as long as the application says it applies, and toggling the Checkbox changes the checked state without clearing it. Derive the mixed state from the options it summarizes, or clear it in the change handler, so a parent Checkbox reflects its children. The Checkbox with a mixed parent example selects every child from the parent and shows the mixed state when only some children are checked.

## In a form

A checked Checkbox submits its name with its value, and an unchecked one submits nothing. Checkbox has no error or description part, so the application renders its own message and links it with `aria-describedby`; marking the Checkbox invalid shows no text. The Checkbox in a form example submits a named Checkbox, handles the submission in the application, and shows its own error. For several checkboxes under one name, use [CheckboxGroup](/components/checkbox-group/), whose usage guide covers repeated form values. The [API reference](#api-reference) lists the props Mux UI defines.
