# TextArea usage

Use TextArea for a paragraph or other multiline text, composed from the Root, TextArea, Label, Description, and Error parts. Use [TextField](/components/text-field/) for one line and [TextEditor](/components/text-editor/) for formatted text.

## Where props go

- Root owns the field. Put `value`, `defaultValue`, and `onChange` on Root, whose `onChange` receives the new text as a string, not an event.
- TextArea.TextArea is the native textarea. Put `rows`, `maxLength`, `placeholder`, and native handlers such as `onKeyDown` on it.
- A native `onChange` on the textarea receives the change event and runs alongside Root's.
- Put `name` on the textarea, not on Root, because only the textarea submits its text.

The TextArea in a form example keeps the text in state on Root, names the textarea, and reads the named value when the form is submitted.

## Limiting length

- Set `maxLength` only when the destination has a real limit, such as a profile card that fits 160 characters, and give the reason in the description.
- Add a count only when seeing the space left helps people finish. Keep it in the application: TextArea has no counter and does not grow with its text.

## Common mistake

Setting `maxLength` with no explanation. The browser stops input at the limit without a message, so say what the limit is and why in the description.
