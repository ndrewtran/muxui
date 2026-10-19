import { useState } from 'react';
import { Button } from '@muxui/react';
import { TextEditor, type TextEditorDocument } from '@muxui/react/text-editor';

type Node = { type: string; text?: string; content?: Node[] };

const empty: TextEditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
const hasText = (node: Node): boolean => Boolean(node.text) || (node.content ?? []).some(hasText);

export function LimitTextEditorExample() {
  const [saved, setSaved] = useState(empty);
  const [draft, setDraft] = useState(empty);
  // Changing the key mounts a fresh editor, which starts again from the saved document.
  const [revision, setRevision] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const missing = attempted && !hasText(draft);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        // The editor does not take part in form validation, so the application checks the document itself.
        if (hasText(draft)) setSaved(draft);
      }}
      onReset={() => {
        setDraft(saved);
        setRevision((current) => current + 1);
        setAttempted(false);
      }}
    >
      <TextEditor
        key={revision}
        label="Note"
        required
        limit={80}
        defaultValue={saved}
        onChange={setDraft}
        errorMessage={missing ? 'Write a note before saving.' : undefined}
      />
      <Button type="submit">Save</Button>
      <Button type="reset" variant="neutral">Reset</Button>
    </form>
  );
}
