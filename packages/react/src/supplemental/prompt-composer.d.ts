import type * as React from 'react';

export type PromptComposerSuggestion = { id: string; label: string; description?: string; insertText?: string };
export type PromptComposerAttachment = { id: string; label: string };
export type PromptComposerModel = { id: string; label: string };
export type PromptComposerProps = Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  inputLabel?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Native textarea props. `form` associates text and Send with that external form's validation, submission and reset. */
  inputProps?: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'children' | 'dangerouslySetInnerHTML'>;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  /** Runs only when the composer host form receives an uncancelled submission. */
  onSend?: (value: string) => void;
  onStop?: () => void;
  pending?: boolean;
  disabled?: boolean;
  error?: React.ReactNode;
  sources?: readonly PromptComposerSuggestion[];
  commands?: readonly PromptComposerSuggestion[];
  onSuggestionSelect?: (item: PromptComposerSuggestion, kind: 'source' | 'command') => void;
  attachments?: readonly PromptComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  models?: readonly PromptComposerModel[];
  selectedModel?: string;
  defaultSelectedModel?: string;
  onModelChange?: (id: string) => void;
  onDictation?: () => void;
};

/** Native form host; Enter submits through native validation, Shift+Enter adds a line. */
export declare const PromptComposer: React.ForwardRefExoticComponent<PromptComposerProps & React.RefAttributes<HTMLFormElement>>;
