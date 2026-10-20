# PromptComposer usage

Use PromptComposer to write a message that the application sends. It owns the text and the controls beside it, and the application owns everything that happens after Send.

## PromptComposer or another family

- Use PromptComposer for a message in a conversation, sent with Enter or the Send button.
- Use [TextArea](/components/text-area/) for multiline text that is saved with a form, and [TextEditor](/components/text-editor/) for formatted content.
- Use [Message](/components/message/) to show messages that were already sent.

## Sending

- Pass `onSend` to send. Without `onSend` or `onSubmit` there is no Send button. Enter sends, Shift+Enter adds a line, and Enter does not send during text composition.
- Send is disabled while the text is empty or only spaces.
- The text stays after Send. Control `value` and clear it in `onSend` once the application accepts the message, as the Suggestions React PromptComposer example does.

## Pending and errors

- Set `pending` while the application works on the message. The text becomes read-only and the other actions are disabled.
- Pass `onStop` to show Stop while `pending`. Without it, no Stop control appears.
- Report a failed send with `error`, which shows under the input. The application clears it, for example when the user edits the text again.

## Optional controls

A control renders only when the application wires it, so supply only what the product supports.

- `sources` and `commands` open suggestions when the user types `@` or `/`. Choosing one inserts its `insertText` and never sends.
- `onFilesSelected` adds an attach button and receives the chosen File array. Uploading is the application's job.
- `models` with `onModelChange` adds a model choice.
- `onDictation` adds a dictation button, and the composer records nothing itself.

## Content

- Name the text field with `inputLabel`, which defaults to Message. It is not shown on screen, so give a visible hint with `inputProps.placeholder`, such as Write a message.
- Give each suggestion a short `label` and, if it helps, a `description`.
- Use `inputProps.maxLength` to cap the text. A suggestion that would go over it is not inserted.

## Common mistake

Expecting the composer to clear itself after Send. It keeps the text, so a second press sends the same message again. Control `value` and set it to an empty string in `onSend`.
