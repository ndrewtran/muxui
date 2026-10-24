// The 32 exports of @muxui/react/text-editor as TEXT-EDITOR-02 expects the text-editor page to show them: the component with
// its ref, attribute surface and every prop, the two functions with their signatures, and the 29 exported types declared as written.
//
// They are written out in full on purpose, read once from the reviewed page and checked against
// packages/react/src/text-editor/index.ts. A pin states the fact, not the reference it is read from: it holds while the page shows
// what the record asks for, and fails when a change to a declaration (a return type, a payload field, a callback) makes the page
// show anything else. A declaration that really changes means this file changes with it, in the same commit.

export const textEditorRef = 'TextEditorHandle';

export const textEditorNative = [{ type: 'React.HTMLAttributes<HTMLDivElement>', omit: ['value', 'defaultValue', 'onChange'] }];

/** Every prop of TextEditor, in the order the page lists them. All are optional. */
export const textEditorProps = [
	['value', 'TextEditorDocument'],
	['defaultValue', 'TextEditorDocument'],
	['onChange', '(value: TextEditorDocument) => void'],
	['label', 'React.ReactNode'],
	['description', 'React.ReactNode'],
	['errorMessage', 'React.ReactNode'],
	['disabled', 'boolean'],
	['readOnly', 'boolean'],
	['required', 'boolean'],
	['invalid', 'boolean'],
	['placeholder', 'string'],
	['limit', 'number'],
	['toolbar', 'false | \'simple\' | \'advanced\' | \'floating\''],
	['floating', 'boolean'],
	['bubbleMenu', 'boolean'],
	['onLinkRequest', '(actions: TextEditorActionCallbacks) => void'],
	['onImageRequest', '(actions: { insertImage(src: string, alt?: string): boolean }) => void'],
	['onColorRequest', '(actions: { setColor(value: string): boolean }) => void'],
	['onGenerate', '() => void'],
	['selectionActions', 'readonly TextEditorSelectionAction[]'],
	['selectionInstruction', 'boolean'],
	['onSelectionRequest', '(request: TextEditorSelectionRequest, actions: TextEditorSelectionActions) => void | Promise<unknown>'],
];

export const textEditorFunctions = {
	isTextEditorDocument: 'isTextEditorDocument(value: unknown): value is TextEditorDocument',
	normalizeTextEditorDocument: 'normalizeTextEditorDocument(value: unknown): TextEditorDocument',
};

/** The exported types, each declared exactly as the page shows it. */
export const textEditorTypes = {
	TextEditorActionCallbacks: `type TextEditorActionCallbacks = {
  setLink(href: string): boolean;
  unsetLink(): boolean;
};`,
	TextEditorAlignment: `type TextEditorAlignment = 'left' | 'center' | 'right' | 'justify';`,
	TextEditorBlockNode: `type TextEditorBlockNode = TextEditorParagraphNode | TextEditorHeadingNode | TextEditorListNode | TextEditorBlockquoteNode | TextEditorCodeBlockNode | TextEditorImageNode | TextEditorHorizontalRuleNode;`,
	TextEditorBlockquoteNode: `type TextEditorBlockquoteNode = {
  type: 'blockquote';
  content: [TextEditorBlockNode, ...TextEditorBlockNode[]];
};`,
	TextEditorBulletListNode: `type TextEditorBulletListNode = {
  type: 'bulletList';
  content: [TextEditorListItemNode, ...TextEditorListItemNode[]];
};`,
	TextEditorCodeBlockNode: `type TextEditorCodeBlockNode = {
  type: 'codeBlock';
  attrs?: { language?: string };
  content?: TextEditorPlainTextNode[];
};`,
	TextEditorCommand: `type TextEditorCommand = {
  type: 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock' | 'unlink' | 'generate';
} | {
  type: 'align';
  value: TextEditorAlignment;
} | {
  type: 'color';
  value: string;
} | {
  type: 'fontFamily';
  value: TextEditorFontFamily;
} | {
  type: 'fontSize';
  value: TextEditorFontSize;
} | {
  type: 'link';
  href: string;
} | {
  type: 'image';
  src: string;
  alt?: string;
};`,
	TextEditorDocument: `type TextEditorDocument = {
  type: 'doc';
  content: [TextEditorBlockNode, ...TextEditorBlockNode[]];
};`,
	TextEditorFontFamily: `type TextEditorFontFamily = 'Inter' | 'Comic Sans MS, Comic Sans' | 'serif' | 'monospace' | 'cursive';`,
	TextEditorFontSize: `type TextEditorFontSize = '12px' | '14px' | '16px' | '18px' | '20px' | '24px' | '28px' | '32px';`,
	TextEditorHandle: `type TextEditorHandle = {
  focus(): void;
  execute(command: TextEditorCommand): boolean;
};`,
	TextEditorHardBreakNode: `type TextEditorHardBreakNode = {
  type: 'hardBreak';
};`,
	TextEditorHeadingNode: `type TextEditorHeadingNode = {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; textAlign?: TextEditorAlignment };
  content?: TextEditorInlineNode[];
};`,
	TextEditorHorizontalRuleNode: `type TextEditorHorizontalRuleNode = {
  type: 'horizontalRule';
};`,
	TextEditorImageNode: `type TextEditorImageNode = {
  type: 'image';
  attrs: { src: string; alt?: string };
};`,
	TextEditorInlineNode: `type TextEditorInlineNode = TextEditorTextNode | TextEditorHardBreakNode;`,
	TextEditorListItemNode: `type TextEditorListItemNode = {
  type: 'listItem';
  content: [TextEditorParagraphNode, ...TextEditorBlockNode[]];
};`,
	TextEditorListNode: `type TextEditorListNode = TextEditorBulletListNode | TextEditorOrderedListNode;`,
	TextEditorMark: `type TextEditorMark = {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code';
} | {
  type: 'link';
  attrs: { href: string };
} | {
  type: 'textStyle';
  attrs: { color?: string; fontFamily?: TextEditorFontFamily; fontSize?: TextEditorFontSize };
};`,
	TextEditorNode: `type TextEditorNode = TextEditorInlineNode | TextEditorBlockNode | TextEditorListItemNode;`,
	TextEditorOrderedListNode: `type TextEditorOrderedListNode = {
  type: 'orderedList';
  attrs?: { start?: number; type?: TextEditorOrderedListType };
  content: [TextEditorListItemNode, ...TextEditorListItemNode[]];
};`,
	TextEditorOrderedListType: `type TextEditorOrderedListType = '1' | 'a' | 'A' | 'i' | 'I';`,
	TextEditorParagraphNode: `type TextEditorParagraphNode = {
  type: 'paragraph';
  attrs?: { textAlign?: TextEditorAlignment };
  content?: TextEditorInlineNode[];
};`,
	TextEditorPlainTextNode: `type TextEditorPlainTextNode = {
  type: 'text';
  text: string;
};`,
	TextEditorProps: `type TextEditorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'defaultValue' | 'onChange'> & TextEditorOwnProps;`,
	TextEditorSelectionAction: `type TextEditorSelectionAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  pendingLabel?: string;
  overflow?: boolean;
};`,
	TextEditorSelectionActions: `type TextEditorSelectionActions = {
  readonly selection: { readonly text: string; readonly document: TextEditorDocument };
  readonly signal: AbortSignal;
  replace(content: string | TextEditorDocument): boolean;
  insertAfter(content: string | TextEditorDocument): boolean;
  close(): void;
};`,
	TextEditorSelectionRequest: `type TextEditorSelectionRequest = {
  type: 'action';
  id: string;
} | {
  type: 'instruction';
  text: string;
};`,
	TextEditorTextNode: `type TextEditorTextNode = {
  type: 'text';
  text: string;
  marks?: TextEditorMark[];
};`,
};
