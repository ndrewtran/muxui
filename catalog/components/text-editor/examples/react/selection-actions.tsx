import { TextEditor, type TextEditorSelectionAction, type TextEditorSelectionRequest } from '@muxui/react/text-editor';

const actions: TextEditorSelectionAction[] = [
  { id: 'shout', label: 'Shout', pendingLabel: 'Shouting…' },
  { id: 'count', label: 'Count words' },
  { id: 'quote', label: 'Quote', overflow: true },
];

// Stand-in for your own model or API. `signal` aborts on Escape, Cancel, or an edit of the selection.
function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function rewrite(text: string, request: TextEditorSelectionRequest) {
  if (request.type === 'instruction') return `${text} (${request.text})`;
  return request.id === 'shout' ? text.toUpperCase() : `"${text}"`;
}

export function SelectionActionsTextEditor() {
  return (
    <TextEditor
      label="Note"
      aria-label="Note editor"
      description="Select text, then choose an action or describe an edit."
      defaultValue={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Select a few words in this draft.' }] }] }}
      selectionActions={actions}
      onSelectionRequest={async (request, { selection, signal, replace, insertAfter }) => {
        await wait(600, signal);
        // replace and insertAfter return false once the request was aborted, so no extra check is needed.
        if (request.type === 'action' && request.id === 'count') insertAfter(` (${selection.text.split(/\s+/u).length} words)`);
        else replace(rewrite(selection.text, request));
      }}
    />
  );
}
