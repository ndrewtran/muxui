import type * as React from 'react';

export type TextEditorFontFamily = 'Inter' | 'Comic Sans MS, Comic Sans' | 'serif' | 'monospace' | 'cursive';
export type TextEditorFontSize = '12px' | '14px' | '16px' | '18px' | '20px' | '24px' | '28px' | '32px';
export type TextEditorAlignment = 'left' | 'center' | 'right' | 'justify';
export type TextEditorMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { type: 'link'; attrs: { href: string } }
  | { type: 'textStyle'; attrs: { color?: string; fontFamily?: TextEditorFontFamily; fontSize?: TextEditorFontSize } };
export type TextEditorTextNode = { type: 'text'; text: string; marks?: TextEditorMark[] };
export type TextEditorPlainTextNode = { type: 'text'; text: string };
export type TextEditorHardBreakNode = { type: 'hardBreak' };
export type TextEditorInlineNode = TextEditorTextNode | TextEditorHardBreakNode;
export type TextEditorParagraphNode = { type: 'paragraph'; attrs?: { textAlign?: TextEditorAlignment }; content?: TextEditorInlineNode[] };
export type TextEditorHeadingNode = { type: 'heading'; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; textAlign?: TextEditorAlignment }; content?: TextEditorInlineNode[] };
export type TextEditorListItemNode = { type: 'listItem'; content: [TextEditorParagraphNode, ...TextEditorBlockNode[]] };
export type TextEditorBulletListNode = { type: 'bulletList'; content: [TextEditorListItemNode, ...TextEditorListItemNode[]] };
export type TextEditorOrderedListType = '1' | 'a' | 'A' | 'i' | 'I';
export type TextEditorOrderedListNode = { type: 'orderedList'; attrs?: { start?: number; type?: TextEditorOrderedListType }; content: [TextEditorListItemNode, ...TextEditorListItemNode[]] };
export type TextEditorListNode = TextEditorBulletListNode | TextEditorOrderedListNode;
export type TextEditorBlockquoteNode = { type: 'blockquote'; content: [TextEditorBlockNode, ...TextEditorBlockNode[]] };
export type TextEditorCodeBlockNode = { type: 'codeBlock'; attrs?: { language?: string }; content?: TextEditorPlainTextNode[] };
export type TextEditorImageNode = { type: 'image'; attrs: { src: string; alt?: string } };
export type TextEditorHorizontalRuleNode = { type: 'horizontalRule' };
export type TextEditorBlockNode = TextEditorParagraphNode | TextEditorHeadingNode | TextEditorListNode | TextEditorBlockquoteNode | TextEditorCodeBlockNode | TextEditorImageNode | TextEditorHorizontalRuleNode;
export type TextEditorNode = TextEditorInlineNode | TextEditorBlockNode | TextEditorListItemNode;
export type TextEditorDocument = { type: 'doc'; content: [TextEditorBlockNode, ...TextEditorBlockNode[]] };
export type TextEditorCommand =
  | { type: 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock' | 'unlink' | 'generate' }
  | { type: 'align'; value: TextEditorAlignment }
  | { type: 'color'; value: string }
  | { type: 'fontFamily'; value: TextEditorFontFamily }
  | { type: 'fontSize'; value: TextEditorFontSize }
  | { type: 'link'; href: string }
  | { type: 'image'; src: string; alt?: string };
export type TextEditorHandle = { focus(): void; execute(command: TextEditorCommand): boolean };
export type TextEditorActionCallbacks = { setLink(href: string): boolean; unsetLink(): boolean };
export type TextEditorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value?: TextEditorDocument;
  defaultValue?: TextEditorDocument;
  onChange?: (value: TextEditorDocument) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  placeholder?: string;
  limit?: number;
  toolbar?: false | 'simple' | 'advanced' | 'floating';
  floating?: boolean;
  bubbleMenu?: boolean;
  onLinkRequest?: (actions: TextEditorActionCallbacks) => void;
  onImageRequest?: (actions: { insertImage(src: string, alt?: string): boolean }) => void;
  onColorRequest?: (actions: { setColor(value: string): boolean }) => void;
  onGenerate?: () => void;
};
export declare const TextEditor: React.ForwardRefExoticComponent<TextEditorProps & React.RefAttributes<TextEditorHandle>> & { Root: typeof TextEditor };
export declare function isTextEditorDocument(value: unknown): value is TextEditorDocument;
export declare function normalizeTextEditorDocument(value: unknown): TextEditorDocument;
