import {
  TextEditor,
  type TextEditorDocument,
  type TextEditorSelectionAction,
  type TextEditorSelectionActions,
  type TextEditorSelectionRequest,
} from '@muxui/react/text-editor';

const actions: readonly TextEditorSelectionAction[] = [
  { id: 'improve', label: 'Improve', icon: <svg aria-hidden="true" />, pendingLabel: 'Improving…' },
  { id: 'shorten', label: 'Shorten', overflow: true },
];

const editor = (
  <TextEditor
    aria-label="Draft"
    selectionActions={actions}
    selectionInstruction={false}
    onSelectionRequest={async (request, { selection, signal, replace, insertAfter, close }: TextEditorSelectionActions) => {
      const text: string = selection.text;
      const document: TextEditorDocument = selection.document;
      const aborted: boolean = signal.aborted;
      const kind: 'action' | 'instruction' = request.type;
      const done: boolean = replace(text) && insertAfter(document);
      if (request.type === 'action') {
        const id: string = request.id;
        void id;
      } else {
        const instruction: string = request.text;
        void instruction;
      }
      close();
      void [document, aborted, kind, done];
    }}
  />
);
const synchronous = <TextEditor aria-label="Draft" onSelectionRequest={() => {}} />;
const requests: TextEditorSelectionRequest[] = [{ type: 'action', id: 'improve' }, { type: 'instruction', text: 'Tighten this' }];
void [editor, synchronous, requests];

// @ts-expect-error A selection action needs an id and a label.
const missingLabel: TextEditorSelectionAction = { id: 'improve' };
// @ts-expect-error A request is an action by id or an instruction by text.
const unknownRequest: TextEditorSelectionRequest = { type: 'command', id: 'improve' };
// @ts-expect-error replace takes a string or a document, never a node.
const nodeContent = <TextEditor aria-label="Draft" onSelectionRequest={(request, { replace }) => { replace({ type: 'paragraph' }); }} />;
// @ts-expect-error The selection snapshot is read-only.
const mutate = <TextEditor aria-label="Draft" onSelectionRequest={(request, actions) => { actions.selection.text = 'changed'; }} />;
// @ts-expect-error selectionActions holds action objects, not strings.
const stringActions = <TextEditor aria-label="Draft" selectionActions={['Improve']} />;
void [missingLabel, unknownRequest, nodeContent, mutate, stringActions];
