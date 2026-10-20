# Checkbox usage

Use Checkbox for selecting or clearing an option. Its children are the visible label.

## Checkbox or Switch

- In a form or a batch, a Checkbox selects an option that takes effect when the form is submitted or the action is applied, such as a term to accept.
- A Checkbox can also apply a preference as soon as it is toggled, when the preference is one of several options chosen together. Save it in the change handler.
- A single setting that is on or off and takes effect at once, such as Notifications, is better as a [Switch](/components/switch/).

## Mixed state

The mixed state is separate from the checked state. Checkbox shows it for as long as the application says it applies, and toggling the Checkbox changes the checked state without clearing it. Derive the mixed state from the options it summarizes, or clear it in the change handler, so a parent Checkbox reflects its children. The Checkbox with a mixed parent example selects every child from the parent and shows the mixed state when only some children are checked.

## Label

- Name the option so that checked means yes, such as Accept terms or Email.
- Avoid a negative label such as Don't send emails, where checking the box turns something off.

## In a form

A checked Checkbox submits its name with its value, and an unchecked one submits nothing. Checkbox has no error or description part, so the application renders its own message and links it with `aria-describedby`; marking the Checkbox invalid shows no text. The Checkbox in a form example submits a named Checkbox, handles the submission in the application, and shows its own error. For an option with a description or error part of its own, use [CheckboxField](/components/checkbox-field/). For several checkboxes under one name, use [CheckboxGroup](/components/checkbox-group/), whose usage guide covers repeated form values. The [API reference](#api-reference) lists the props Mux UI defines.

## Common mistake

Expecting an unchecked Checkbox to submit `false`. It submits nothing, so `FormData.get` returns `null`. Test for the name with `FormData.has`, as the Checkbox in a form example does.
