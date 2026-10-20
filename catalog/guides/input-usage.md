# Input usage

Use Input when you place the field's parts yourself: Root, Input, Label, Description, and Error. [TextField](/components/text-field/) takes the label, description, and error message as props.

## Input or TextField

- Use [TextField](/components/text-field/) for a standard labelled field. The label, description, and error are laid out for you.
- Use Input when the layout needs something beside or between the parts, such as an action in the label row, as the Input with an action in the label row example shows.

## Where props go

- Root owns the field. Put `value`, `defaultValue`, and `onChange` on Root, whose `onChange` receives the new string, not an event.
- Input.Input is the native input. Put `name`, `type`, `placeholder`, native handlers, and the ref on it, as the Input in a form example does.

## Content

- Name the field with a noun, such as Name, in Input.Label.
- Keep the placeholder for an example value, such as Ada Lovelace, and use the description for what the field is for, such as Shown on your profile.

## Common mistake

Rendering Input.Error all the time. It shows whenever it is mounted, so render it only while the field is invalid.
