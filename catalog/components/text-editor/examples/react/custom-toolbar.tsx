import { useRef, useState } from 'react';
import { Button, TextField, ToggleButton, Toolbar } from '@muxui/react';
import { TextEditor, normalizeTextEditorUrl, type TextEditorCommand, type TextEditorFormatting, type TextEditorHandle } from '@muxui/react/text-editor';

type Tool = { label: string; on: (formatting: TextEditorFormatting) => boolean; command: (on: boolean) => TextEditorCommand };

// Each tool shows the formatting the editor reports and sends a command back. Heading sets the block and leaves a heading
// that already is one alone, so the tool sends a paragraph to turn its heading off.
const tools: Tool[] = [
  { label: 'Bold', on: ({ marks }) => marks.bold, command: () => ({ type: 'bold' }) },
  { label: 'Italic', on: ({ marks }) => marks.italic, command: () => ({ type: 'italic' }) },
  { label: 'Strikethrough', on: ({ marks }) => marks.strike, command: () => ({ type: 'strike' }) },
  { label: 'Inline code', on: ({ marks }) => marks.code, command: () => ({ type: 'code' }) },
  { label: 'Heading', on: ({ headingLevel }) => headingLevel === 2, command: (on) => (on ? { type: 'paragraph' } : { type: 'heading', level: 2 }) },
  { label: 'Quote', on: ({ quote }) => quote, command: () => ({ type: 'blockquote' }) },
  { label: 'Bullet list', on: ({ list }) => list === 'bulletList', command: () => ({ type: 'bulletList' }) },
];

export function CustomToolbarTextEditorExample() {
  const editor = useRef<TextEditorHandle>(null);
  const [formatting, setFormatting] = useState<TextEditorFormatting | null>(null);
  const [address, setAddress] = useState('');
  // The rule the link command applies, so the form can refuse an address before sending it.
  const href = normalizeTextEditorUrl(address, 'link');
  const refused = address !== '' && href === null;
  const addLink = () => {
    if (href === null) return;
    // At a caret outside a link the address becomes the link text. Otherwise the selected text, or the whole link the
    // caret is in, takes the address.
    const atCaret = formatting?.empty === true && formatting.link === null;
    editor.current?.execute(atCaret ? { type: 'link', href, text: address } : { type: 'link', href });
  };
  return (
    <div>
      <Toolbar aria-label="Formatting">
        {tools.map((tool) => {
          const on = formatting ? tool.on(formatting) : false;
          return (
            <ToggleButton key={tool.label} selected={on} onActivate={() => editor.current?.execute(tool.command(on))}>
              {tool.label}
            </ToggleButton>
          );
        })}
      </Toolbar>
      <TextEditor ref={editor} label="Post" toolbar={false} onFormattingChange={setFormatting} />
      <TextField
        label="Link address"
        value={address}
        onChange={setAddress}
        invalid={refused}
        errorMessage="Use an address that starts with https://, http://, or mailto:."
      />
      <Button disabled={href === null} onActivate={addLink}>{formatting?.link ? 'Change link' : 'Add link'}</Button>
      {formatting?.link ? <Button variant="neutral" onActivate={() => editor.current?.execute({ type: 'unlink' })}>Remove link</Button> : null}
    </div>
  );
}
