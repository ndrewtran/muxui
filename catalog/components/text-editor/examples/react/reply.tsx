import { useRef, useState } from 'react';
import { Button } from '@muxui/react';
import { TextEditor, type TextEditorHandle } from '@muxui/react/text-editor';

export function ReplyTextEditorExample() {
  const editor = useRef<TextEditorHandle>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  if (!open) return <Button onActivate={() => setOpen(true)}>Reply</Button>;
  return (
    <div>
      {/* The reply opens three lines tall, grows with its text to ten, then scrolls inside. autoFocus focuses it once its
          content is in the page, without moving the page, and onReady says when that is. */}
      <TextEditor
        ref={editor}
        label="Reply"
        toolbar={false}
        autoFocus
        minRows={3}
        maxRows={10}
        onReady={() => setReady(true)}
      />
      {/* Hands keyboard input back to the reply at once, without scrolling to it. */}
      <Button variant="neutral" disabled={!ready} onActivate={() => editor.current?.focus({ preventScroll: true })}>Back to the reply</Button>
      <Button variant="ghost" onActivate={() => { setOpen(false); setReady(false); }}>Cancel</Button>
    </div>
  );
}
