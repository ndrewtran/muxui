// The 32 exports of @muxui/react/text-editor, as the ledger record TEXT-EDITOR-02 asks the TextEditor Docs page to show them: the
// component with its ref, attribute surface and every prop, the two functions with their signatures, and the 29 exported types
// declared as the page prints them.
//
// They are written out in full on purpose and checked against packages/react/src/text-editor/index.ts (`sourceProblems`), so a pin
// states the fact and not the reference the page is read from: it holds while the page shows what the record asks for, and fails
// when a declaration changes (a return type, a payload field, a callback) so that the page shows anything else. A declaration that
// really changes means this file changes with it, in the same commit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const textEditorEntry = './text-editor';

export const textEditorRef = 'TextEditorHandle';

export const textEditorNative = { type: 'React.HTMLAttributes<HTMLDivElement>', omit: ['value', 'defaultValue', 'onChange'] };

/** Every prop of TextEditor, in the order its declaration lists them. All are optional. */
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
  ['toolbar', "false | 'simple' | 'advanced' | 'floating'"],
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

/** The exported types, each as the page prints it. */
export const textEditorTypes = {
  TextEditorActionCallbacks: `type TextEditorActionCallbacks = {
  setLink(href: string): boolean;
  unsetLink(): boolean;
};`,
  TextEditorAlignment: "type TextEditorAlignment = 'left' | 'center' | 'right' | 'justify';",
  TextEditorBlockNode: 'type TextEditorBlockNode = TextEditorParagraphNode | TextEditorHeadingNode | TextEditorListNode | TextEditorBlockquoteNode | TextEditorCodeBlockNode | TextEditorImageNode | TextEditorHorizontalRuleNode;',
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
  TextEditorFontFamily: "type TextEditorFontFamily = 'Inter' | 'Comic Sans MS, Comic Sans' | 'serif' | 'monospace' | 'cursive';",
  TextEditorFontSize: "type TextEditorFontSize = '12px' | '14px' | '16px' | '18px' | '20px' | '24px' | '28px' | '32px';",
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
  TextEditorInlineNode: 'type TextEditorInlineNode = TextEditorTextNode | TextEditorHardBreakNode;',
  TextEditorListItemNode: `type TextEditorListItemNode = {
  type: 'listItem';
  content: [TextEditorParagraphNode, ...TextEditorBlockNode[]];
};`,
  TextEditorListNode: 'type TextEditorListNode = TextEditorBulletListNode | TextEditorOrderedListNode;',
  TextEditorMark: `type TextEditorMark = {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code';
} | {
  type: 'link';
  attrs: { href: string };
} | {
  type: 'textStyle';
  attrs: { color?: string; fontFamily?: TextEditorFontFamily; fontSize?: TextEditorFontSize };
};`,
  TextEditorNode: 'type TextEditorNode = TextEditorInlineNode | TextEditorBlockNode | TextEditorListItemNode;',
  TextEditorOrderedListNode: `type TextEditorOrderedListNode = {
  type: 'orderedList';
  attrs?: { start?: number; type?: TextEditorOrderedListType };
  content: [TextEditorListItemNode, ...TextEditorListItemNode[]];
};`,
  TextEditorOrderedListType: "type TextEditorOrderedListType = '1' | 'a' | 'A' | 'i' | 'I';",
  TextEditorParagraphNode: `type TextEditorParagraphNode = {
  type: 'paragraph';
  attrs?: { textAlign?: TextEditorAlignment };
  content?: TextEditorInlineNode[];
};`,
  TextEditorPlainTextNode: `type TextEditorPlainTextNode = {
  type: 'text';
  text: string;
};`,
  TextEditorProps: "type TextEditorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'defaultValue' | 'onChange'> & TextEditorOwnProps;",
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

/** The 32 exports by name: the component, the two functions and the 29 types, in the order the page's index lists them. */
export const textEditorExports = ['TextEditor', 'isTextEditorDocument', 'normalizeTextEditorDocument', ...Object.keys(textEditorTypes)];

/** Strips what the printer and the author format differently: comments, whitespace, separators, the `React.` namespace and a leading `|`. */
const squash = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '')
  .replace(/React\./gu, '')
  .replace(/[\s;,]+/gu, '')
  .replace(/=\|/gu, '=');

/**
 * Where this file differs from the TextEditor source: every type is declared there as written here, every prop has the same
 * name and type in `TextEditorOwnProps`, the two functions and the ref and attribute surface are the source's. Empty when it
 * holds; by default it reads the source on disk, so a change to a declaration shows up even when no model reads it.
 */
export function sourceProblems(repositoryRoot, source = readFileSync(resolve(repositoryRoot, 'packages/react/src/text-editor/index.ts'), 'utf8')) {
  const squashed = squash(source);
  const problems = [];
  for (const [name, text] of Object.entries(textEditorTypes)) {
    if (!squashed.includes(`export${squash(text)}`)) problems.push(`the source does not declare ${name} as ${text}`);
  }
  const exported = [...source.matchAll(/^export (?:type|function|const) (\w+)/gmu)].map(([, name]) => name).filter((name) => name.startsWith('TextEditor') || /TextEditorDocument$/u.test(name));
  const expected = new Set(textEditorExports);
  for (const name of exported) if (!expected.has(name)) problems.push(`the source exports ${name}, which this file does not pin`);
  for (const name of expected) if (!exported.includes(name)) problems.push(`this file pins ${name}, which the source does not export`);
  const own = /type TextEditorOwnProps = \{([\s\S]*?)\n\};/u.exec(source)?.[1];
  if (own === undefined) {
    problems.push('the source has no TextEditorOwnProps');
  } else {
    const squashedOwn = squash(own);
    for (const [name, type] of textEditorProps) if (!squashedOwn.includes(`${name}?:${squash(type)}`)) problems.push(`the source does not declare the prop ${name}?: ${type}`);
    const members = [...own.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/^ {2}(\w+)\??:/gmu)].map(([, name]) => name);
    if (members.join() !== textEditorProps.map(([name]) => name).join()) problems.push(`the source lists the props ${members.join(', ')}`);
  }
  for (const [name, signature] of Object.entries(textEditorFunctions)) {
    if (!squashed.includes(`exportfunction${squash(signature)}`)) problems.push(`the source does not declare ${name} as ${signature}`);
  }
  if (!squashed.includes('ForwardRefExoticComponent<TextEditorProps&RefAttributes<TextEditorHandle>>')) problems.push('the source does not give the component the ref TextEditorHandle');
  const omitted = textEditorNative.omit.map((name) => `'${name}'`).join(' | ');
  if (!squashed.includes(squash(`typeTextEditorProps=Omit<${textEditorNative.type}, ${omitted}> & TextEditorOwnProps`))) problems.push(`the source does not give the component the native surface ${textEditorNative.type} except ${textEditorNative.omit.join(', ')}`);
  return problems;
}
