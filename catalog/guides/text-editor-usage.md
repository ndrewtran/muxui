# TextEditor usage

Use TextEditor to edit formatted content. Its value is a document made of blocks, not HTML or Markdown, and `onChange` receives the new document after each accepted edit.

## Choosing a toolbar

Choose by the task.

- Use the simple toolbar, the default, for a short formatted note. It has Bold, Italic, Underline, Color, alignment, and Bullet list, and asks nothing of the application.
- Use the advanced toolbar for document authoring. It adds font choices, Link, Image, and Generate with AI, so supply `onLinkRequest`, `onImageRequest`, and `onGenerate` with it.
- Without those handlers, Link and Image ask for an address in a browser prompt, and Generate with AI does nothing.
- Use `toolbar={false}` when the application formats through the editor ref instead.

The Basic React TextEditor example is the simple recipe. The Advanced React TextEditor example supplies all three handlers as stand-ins for the application's own flows.

## Selection formatting and selection actions

These are two separate features.

- `bubbleMenu` shows Bold, Italic, Underline, and Link while text is selected. It formats the selected text.
- `onSelectionRequest` adds a bar under a selection for the application's own edits, from `selectionActions` or a Describe edits field.
- The application's handler supplies the replacement, and the user then chooses Keep, Discard, or Try again.

The Selection actions React TextEditor example runs a caller-owned edit with a Keep, Discard, and Try again review.

## Limits

- `limit` counts the characters of the editor's plain text, and the hint under the editor shows how many are left.
- An edit over the limit is refused. It does not apply, `onChange` does not run, and it adds no undo step.
- Undo and redo are exempt from the limit.
- A paste is measured after Markdown formatting, so pasting `**bold**` counts the word, not the asterisks. A paste that still does not fit is refused whole and is not shortened.
- A Markdown shortcut typed by hand is judged one character at a time. Typed exactly at the limit, its closing character is refused, even though the formatted text would fit.
- A document that starts over the limit is shown as given, and an edit that does not make it longer applies.

The TextEditor with a character limit example limits a note and checks it before saving.

## Content

- Give the editor a visible `label`, and put guidance in `description`.
- Treat a stored document as untrusted. Check it with `isTextEditorDocument`, or clean it with `normalizeTextEditorDocument`, as the TextEditor with a stored document example does.

## Common mistake

Expecting `required` to stop a form from submitting. TextEditor submits no value and takes no part in native form validation, so check the document in the submit handler, as the limit example does.
