# TextEditor usage

Use TextEditor to edit formatted content. Its value is a document made of blocks, not HTML, and `onChange` receives the new document after each accepted edit. With `markdown`, the value is Markdown text instead, as Markdown under Content describes.

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
- Send each tool's command through the handle's `execute`. Heading and paragraph set the block and leave one that already is it, without focusing the editor, so a heading tool sends a paragraph to turn its heading off.
- Each command that changes the document is one undo step of its own, and one that changes nothing splits no undo step. A mark command returns false where the mark cannot go, such as in a code block, and changes nothing there.
- At a caret, `marks` and the built-in tools show what the next typed text takes, so a block that takes no mark, such as a code block, shows none, even after a shortcut there. Over a range, `marks` shows a mark on only where all the selected text has it. The bold, italic, underline, strike, and code commands switch there as their shortcuts do, which count inline code as having the mark, so over bold text and inline code `marks` shows bold off and the bold command takes it off.
- At a caret in a link, the link and unlink commands act on the whole link. The caret is in a link where typed text would extend it: at its end, not its start, even where the link starts a paragraph.
- Given text, the link command inserts it at a caret, or puts it in place of the selection, and the text typed after it is not linked, also after an undo and redo of it.
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
- A command the limit refuses changes nothing, and `execute` returns false for it, an image included.
- Undo and redo are exempt from the limit.
- A paste is measured after Markdown formatting, so pasting `**bold**` counts the word, not the asterisks. A paste that still does not fit is refused whole and is not shortened.
- A Markdown shortcut typed by hand is judged one character at a time. Typed exactly at the limit, its closing character is refused, even though the formatted text would fit.
- A document that starts over the limit is shown as given, and an edit that does not make it longer applies.

The TextEditor with a character limit example limits a note and checks it before saving.

## Content

- Give the editor a visible `label`, and put guidance in `description`.
- Treat a stored document as untrusted. Check it with `isTextEditorDocument`, or clean it with `normalizeTextEditorDocument`, as the TextEditor with a stored document example does. Text is never empty: the check refuses empty text and cleaning drops it.
- However a link or an image comes in, typed, pasted, dropped, or in a value, it keeps its address only where the link and image commands would. A refused link keeps its text and a refused image its description; an image typed as Markdown stays the text typed.
- The editor keeps an empty paragraph after a final block that is not one, such as code or an image, so the caret can go below it. It adds that paragraph itself, so `onChange` does not report it, and a controlled document without it changes nothing.
- A controlled document is compared with the content as the editor holds both, so marks in another order, text split where its marks stay the same, and attributes left at their defaults, such as a numbered list's start, replace nothing.
- A controlled value that replaces the content is applied as given, with no address in it linked, also when undo or redo brings it back, and is one undo step of its own, apart from the typing just before and after it.

### Markdown

- For content kept as Markdown, give the editor `markdown`: the Markdown `value` or `defaultValue`, an `onChange` that receives Markdown, and `fromMarkdown` and `toMarkdown` from `@muxui/react/text-editor/markdown`.
- `@muxui/react/text-editor` never loads the converters, and `@muxui/react/text-editor/markdown` never loads the editor, so code that only reads or writes Markdown, on a server too, takes no editor with it.
- `onChange` runs when the Markdown changes. An edit Markdown cannot show, such as an empty paragraph or a space at the end of a line, reports nothing.
- A controlled value is compared as Markdown, so the editor keeps its content and caret for the Markdown it reported and for Markdown that reads the same, such as underscores where the editor writes asterisks. Other Markdown replaces the content.
- With `markdown` the editor takes the Markdown preset. `preset="markdown"` gives that preset to an editor whose value stays a document. It holds no underline, color, font or alignment, so a paste loses them, their commands return false and report off, their shortcuts do nothing, and the toolbar shows Strikethrough in place of Underline.
- With `markdown`, pasted plain text is read as Markdown and pasted HTML as HTML. Text pasted as plain text, with Shift, stays as typed. A paste over selected text takes its place, so an address pasted there is text, as a bare address is in Markdown.
- `limit` counts the editor's text with `markdown` too, not the characters of the Markdown.
- To convert at the edges instead, as on a server, `fromMarkdown` reads CommonMark and strike into a document that `isTextEditorDocument` accepts, and `toMarkdown` writes one back. Both are pure and synchronous, and take time linear in their input.
- Dense formatting costs more time than its length suggests. A megabyte of ordinary prose writes in about 0.15 s and reads in about 0.2 s, but a megabyte of text whose formatting overlaps in every word, 27 MB as a document, takes about six seconds to write. An application that converts untrusted documents on a server should bound their size or convert them in a worker.
- Converting drops what Markdown cannot hold, and any link or image address the editor refuses, keeping its text. A link keeps an absolute http, https or mailto address and an image an absolute http or https one, never with a user name or password. A relative or fragment-only address is dropped.
- Raw HTML and syntax outside the editor's grammar, such as tables, footnotes, task lists, reference links and bare addresses, stay literal text, and are written back escaped so they read as the same text.

A round trip changes these once; a second changes nothing.

- Reading: a soft line break becomes a space, and spaces and tabs at the ends of a line go. A hard break that ends a block goes, and one in a heading becomes a space. Link and image titles go. An image is a block, so one in a paragraph splits it, and one in a link or a heading becomes its description, which is plain text of at most 1,000 characters. Inline code takes no other formatting. A code fence keeps the first word of its info string as the language, and indented code has none. A numbered list from 0 starts at 1, and tight and loose lists read alike. A list item that starts with another block gets an empty first paragraph. Markers nested deeper than the editor holds stay literal text.
- Writing: underline, color, font, size, alignment and letter or roman numbering go, and so do empty paragraphs. A line break inside text becomes a space, and a list starts at most at 999999999. In a list item, a code line of only spaces reads back empty. Where formatting meets other formatting inside a word, a mark that goes on past the others is closed and opened again around them, so italic that goes on where bold and strike start keeps all three. Where Markdown still cannot write the word, it loses its italic, then strike, then bold, until it can, and the rest of the paragraph keeps its formatting.
- Both ways: bold, italic or strike that starts or ends on a space, or on punctuation a letter touches, gives that space or punctuation up, as Markdown cannot open or close there.

The TextEditor with a Markdown value example keeps a Markdown note.

## Common mistake

Expecting `required` to stop a form from submitting. TextEditor submits no value and takes no part in native form validation, so check the document in the submit handler, as the limit example does.
