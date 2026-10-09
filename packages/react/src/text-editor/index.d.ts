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
/** An action in the bar under a text selection. The caller supplies any icon. */
export type TextEditorSelectionAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Text shown while the request runs. Defaults to "Editing…". */
  pendingLabel?: string;
  /** Shown only after "More actions" expands the bar. */
  overflow?: boolean;
};
export type TextEditorSelectionRequest =
  | { type: 'action'; id: string }
  | { type: 'instruction'; text: string };
/**
 * The controller for one selection request. Edits apply to the selected range
 * as it was when the request started, and every method returns without effect
 * once the request is stale.
 */
export type TextEditorSelectionActions = {
  /** The selected text and content when the request started. */
  readonly selection: { readonly text: string; readonly document: TextEditorDocument };
  /** Aborts on Escape or Cancel, an edit of the selected range, a new request, `close()`, and unmount. */
  readonly signal: AbortSignal;
  /**
   * Replaces the selection and starts the Keep, Discard, and Try again review.
   * A string is plain text that takes the formatting at the start of the selection and turns line breaks into
   * hard breaks; a document keeps its own formatting. Only the first successful edit of a request applies.
   * Returns false when the request is stale or aborted, the editor is disabled or read-only, `limit` would be
   * exceeded, or the content is invalid.
   */
  replace(content: string | TextEditorDocument): boolean;
  /**
   * Like `replace`, but leaves the selection in place. A string is inserted right after the selection; a
   * document is inserted as blocks after the block that holds the end of the selection.
   */
  insertAfter(content: string | TextEditorDocument): boolean;
  /** Ends the request and its bar, keeping any applied edit. */
  close(): void;
};
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
  /** Actions in the selection bar. Enabled with `onSelectionRequest`. */
  selectionActions?: readonly TextEditorSelectionAction[];
  /** Shows the "Describe edits" field in the selection bar. Defaults to true. */
  selectionInstruction?: boolean;
  /**
   * Called when an action or instruction is sent. A returned promise shows the pending state; a rejection shows
   * a failure message with Try again and Dismiss.
   */
  onSelectionRequest?: (request: TextEditorSelectionRequest, actions: TextEditorSelectionActions) => void | Promise<unknown>;
};
export declare const TextEditor: React.ForwardRefExoticComponent<TextEditorProps & React.RefAttributes<TextEditorHandle>> & { Root: typeof TextEditor };
export declare function isTextEditorDocument(value: unknown): value is TextEditorDocument;
export declare function normalizeTextEditorDocument(value: unknown): TextEditorDocument;
