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

## Building your own toolbar

- Use `toolbar={false}` with `onFormattingChange` to draw the tools yourself. Each report gives the `marks`, the `link`, the `block` and `headingLevel`, the nearest `list`, and whether a `quote` holds the selection.
- A report comes once the editor is ready and again whenever the formatting at the selection changes, a caret move alone included.
- Send each tool's command through the handle's `execute`. Heading and paragraph set the block and leave one that already is it, so a heading tool sends a paragraph to turn its heading off.
- At a caret in a link, the link and unlink commands act on the whole link. The caret is in a link where typed text would extend it: at its end, not its start.
- Given text, the link command inserts it at a caret, or puts it in place of the selection, and the text typed after it is plain.
- Check an address with `normalizeTextEditorUrl` before sending it. The link and image commands refuse exactly what it refuses.
- Keep the tools one Tab stop with arrow keys between them, as [Toolbar](/components/toolbar/) does, and give each tool a name and its pressed state.

The TextEditor with its own formatting controls example builds them.

## Opening and focus

- The editor renders its content on the client after mount, so server markup holds the label and the field around it. `onReady` runs once the content is in the page.
- `autoFocus` focuses the content when it is ready, without scrolling, if it is editable. Use it for a field the user just opened, not one that returns with the page.
- The handle's `focus` waits a frame and scrolls the selection into view. With `preventScroll` it focuses at once and leaves the page still, which suits a field that is still opening.
- The keys are the editor's own: Mod+B and Mod+I for marks, Mod+K for a link, and Alt+F10 into the selection bar.

The TextEditor for a reply that opens focused example opens a reply this way.

## Height

- `minRows` and `maxRows` set the content's least and greatest height in lines of its text. It grows with its text between them, then scrolls inside with the caret in view.
- A line follows the content's font size and the page zoom, so the rows hold when either changes.
- The height follows the text at once, with no animation, so reduced motion needs nothing more.

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
