# TextField

Use the Mux UI React TextField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## TextField or another field

- Use TextField for a single line of free text, such as a name or an email address.
- Use [Input](/components/input/) when you need to place the label, input, and messages yourself.
- Use [TextArea](/components/text-area/) for several lines, [SearchField](/components/search-field/) for a query, and [NumberField](/components/number-field/) for a number.

## Content

- Name the field with a noun, such as Email, not an instruction or a question.
- Set `type`, `autoComplete`, and `inputMode` to match the value, such as `type="email"` for an address.
- Keep the placeholder for an example value and use the description for what the field is for, such as Shown on your profile.

## Common mistake

Reading `event.target.value` in the change handler. TextField's `onChange` receives the new string, so pass the state setter directly, as in `onChange={setName}`.
