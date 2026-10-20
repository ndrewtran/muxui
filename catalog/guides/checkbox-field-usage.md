# CheckboxField usage

Use CheckboxField for one option that needs a description or an error message beside it, composed from the Root, Button, Indicator, Description, and Error parts. [Checkbox](/components/checkbox/) takes only a label and has neither part.

## CheckboxField, Checkbox, or CheckboxGroup

- Use CheckboxField for one independent option with its own description or error, such as accepting terms.
- Use [Checkbox](/components/checkbox/) when the label alone is enough.
- Use [CheckboxGroup](/components/checkbox-group/) for several related options that share a label and a name.

## Required choice

- Show the error after the user tries to submit or continue, not before. Until then, leave the field valid so the Error part stays hidden.
- Clear the error as soon as the user selects the option.

The CheckboxField in a form example turns on `attempted` in the submit handler and sets `invalid` from `attempted && !accepted`, so the Error appears on a failed attempt and goes away when the box is checked.

## Label and description

- Label the option itself, so that checked means yes, such as Email updates.
- Put what the choice means in the description, such as Receive product news.
- Word the error as the step to take, such as Accept the terms to continue.

## Common mistake

Placing the label text outside Button. Button is the label that wraps the input, so text beside it is not part of the label and clicking it does not toggle the box. Put the text inside Button, after Indicator.
