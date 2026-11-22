import {
  TextEditor,
  normalizeTextEditorUrl,
  type TextEditorActionCallbacks,
  type TextEditorCommand,
  type TextEditorDocument,
  type TextEditorFormatting,
  type TextEditorHandle,
  type TextEditorMarkdown,
  type TextEditorProps,
  type TextEditorSelectionAction,
  type TextEditorSelectionActions,
  type TextEditorSelectionRequest,
} from '@muxui/react/text-editor';
import { fromMarkdown, toMarkdown } from '@muxui/react/text-editor/markdown';

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

// The callbacks' members are methods, so a consumer's narrower function is assignable to each; a function property would refuse all of these.
type ImageActions = Parameters<NonNullable<TextEditorProps['onImageRequest']>>[0];
type ColorActions = Parameters<NonNullable<TextEditorProps['onColorRequest']>>[0];
const narrowReplace: Pick<TextEditorSelectionActions, 'replace' | 'insertAfter'> = { replace: (content: string) => true, insertAfter: (content: string) => true };
const narrowImage: ImageActions = { insertImage: (src: 'https://example.com/a.png') => true };
const narrowColor: ColorActions = { setColor: (value: '#000000') => true };
const narrowLink: TextEditorActionCallbacks = { setLink: (href: 'https://example.com') => true, unsetLink: () => true };
void [narrowReplace, narrowImage, narrowColor, narrowLink];

// Commands for a custom toolbar: marks, blocks by level, a rule, plain text, and a link with its own text.
const commands: TextEditorCommand[] = [
  { type: 'strike' }, { type: 'code' }, { type: 'heading', level: 6 }, { type: 'paragraph' }, { type: 'horizontalRule' },
  { type: 'text', text: 'Hello' }, { type: 'link', href: 'https://example.com', text: 'Example' }, { type: 'link', href: 'https://example.com' },
];
// @ts-expect-error A heading level is 1 to 6.
const deepHeading: TextEditorCommand = { type: 'heading', level: 7 };
// @ts-expect-error A heading needs its level.
const bareHeading: TextEditorCommand = { type: 'heading' };
// @ts-expect-error Text to insert is a string.
const numberText: TextEditorCommand = { type: 'text', text: 1 };
void [commands, deepHeading, bareHeading, numberText];

// The formatting is plain, read-only values.
const readFormatting = (formatting: TextEditorFormatting) => {
  const marks: boolean[] = [formatting.marks.bold, formatting.marks.italic, formatting.marks.underline, formatting.marks.strike, formatting.marks.code];
  const link: string | null = formatting.link;
  const block: 'paragraph' | 'heading' | 'codeBlock' | null = formatting.block;
  const level: 1 | 2 | 3 | 4 | 5 | 6 | null = formatting.headingLevel;
  const list: 'bulletList' | 'orderedList' | null = formatting.list;
  const flags: boolean[] = [formatting.empty, formatting.quote];
  void [marks, link, block, level, list, flags];
};
// @ts-expect-error The formatting is read-only.
const writeFormatting = (formatting: TextEditorFormatting) => { formatting.marks.bold = true; };
const lifecycle = <TextEditor aria-label="Reply" autoFocus onReady={() => {}} onFormattingChange={readFormatting} minRows={3} maxRows={10} />;
// @ts-expect-error A row count is a number.
const stringRows = <TextEditor aria-label="Reply" minRows="3" />;
void [writeFormatting, lifecycle, stringRows];

// Focus takes an optional preventScroll, and the address check names its kind.
declare const handle: TextEditorHandle;
handle.focus();
handle.focus({ preventScroll: true });
const address: string | null = normalizeTextEditorUrl('https://example.com', 'link');
const picture: string | null = normalizeTextEditorUrl('https://example.com/a.png', 'image');
// @ts-expect-error The kind is link or image.
const video = normalizeTextEditorUrl('https://example.com/a.mp4', 'video');
void [address, picture, video];

// A document holds at least one block, and a list item a paragraph before its other blocks.
const oneBlock: TextEditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
// @ts-expect-error A document holds at least one block.
const emptyDocument: TextEditorDocument = { type: 'doc', content: [] };
// @ts-expect-error A list item holds a paragraph first.
const emptyItem: TextEditorDocument = { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [] }] }] };
void [oneBlock, emptyDocument, emptyItem];

// The Markdown value mode takes and reports Markdown text, with the converters from their own entry.
const controlledMarkdown = <TextEditor aria-label="Post" markdown={{ fromMarkdown, toMarkdown, value: '# Title', onChange: (markdown) => { const text: string = markdown; void text; } }} />;
const uncontrolledMarkdown = <TextEditor aria-label="Post" toolbar="advanced" markdown={{ fromMarkdown, toMarkdown, defaultValue: '**bold**' }} />;
const markdownPreset = <TextEditor aria-label="Note" preset="markdown" defaultValue={oneBlock} onChange={(value) => { const kept: TextEditorDocument = value; void kept; }} />;
const markdownValue: TextEditorMarkdown = { fromMarkdown, toMarkdown, value: '' };
// @ts-expect-error The Markdown value mode needs both converters.
const noConverters = <TextEditor aria-label="Post" markdown={{ value: '# Title' }} />;
// @ts-expect-error The Markdown value is text, not a document.
const documentMarkdown = <TextEditor aria-label="Post" markdown={{ fromMarkdown, toMarkdown, value: oneBlock }} />;
// @ts-expect-error The Markdown callback receives text, not a document.
const documentCallback = <TextEditor aria-label="Post" markdown={{ fromMarkdown, toMarkdown, onChange: (value: TextEditorDocument) => { void value; } }} />;
// @ts-expect-error The preset is rich or markdown.
const htmlPreset = <TextEditor aria-label="Note" preset="html" />;
const read: TextEditorDocument = fromMarkdown('# Title');
const written: string = toMarkdown(read);
// @ts-expect-error toMarkdown writes a document, not text.
const rewritten = toMarkdown('# Title');
void [controlledMarkdown, uncontrolledMarkdown, markdownPreset, markdownValue, noConverters, documentMarkdown, documentCallback, htmlPreset, written, rewritten];
