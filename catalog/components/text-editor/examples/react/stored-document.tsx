import { useRef } from 'react';
import { Button } from '@muxui/react';
import { TextEditor, isTextEditorDocument, normalizeTextEditorDocument, type TextEditorHandle } from '@muxui/react/text-editor';

// Stored JSON is untrusted. This document has a link mark with an unsafe address.
const stored: unknown = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Saved note', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
  }],
};

// isTextEditorDocument is false for this value. Normalizing keeps the text and drops the mark.
const initial = isTextEditorDocument(stored) ? stored : normalizeTextEditorDocument(stored);

export function StoredDocumentTextEditorExample() {
  const editor = useRef<TextEditorHandle>(null);
  return (
    <div>
      <TextEditor ref={editor} label="Note" toolbar={false} defaultValue={initial} />
      <Button onActivate={() => editor.current?.execute({ type: 'bold' })}>Bold</Button>
      <Button onActivate={() => editor.current?.execute({ type: 'image', src: 'https://example.com/photo.png', alt: 'Team photo' })}>Insert image</Button>
    </div>
  );
}
