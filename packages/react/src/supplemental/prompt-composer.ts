import React from 'react';
import type { ForwardRefExoticComponent, FormHTMLAttributes, ReactNode, Ref, RefAttributes, SubmitEvent as FormSubmitEvent, TextareaHTMLAttributes } from 'react';
import { Select } from '../select.ts';
import Plus from 'lucide-react/dist/esm/icons/plus.mjs';
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up.mjs';
import Square from 'lucide-react/dist/esm/icons/square.mjs';
import Mic from 'lucide-react/dist/esm/icons/mic.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';

export type PromptComposerSuggestion = { id: string; label: string; description?: string; insertText?: string };
export type PromptComposerAttachment = { id: string; label: string };
export type PromptComposerModel = { id: string; label: string };

/**
 * The props Mux UI defines for PromptComposer; the catalog's web.react API is derived from this type
 * (Decision 0031). It is a type literal, so the public props type stays assignable to Record<string, unknown>,
 * as it was before the move, and it is not exported: this module is re-exported whole, so exporting it would add
 * it to the package's surface. Every other attribute of a form passes through to the form, and `inputRef`, a ref,
 * stays in the public type beside it. The form's own `submit`, `change`, and `reset` events are native events the
 * form passes through, so they are not Mux UI-owned. Cancelling `submit` stops `onSend`, and cancelling `reset`
 * stops the composer restoring its text and model.
 */
type PromptComposerOwnProps = {
  /** The accessible name of the textarea, when `inputProps` gives it neither an `aria-label` nor an `aria-labelledby`. */
  inputLabel?: string;
  /** The text, when the caller controls it. */
  value?: string;
  /** The text at first, when the composer controls itself. A form reset restores it. */
  defaultValue?: string;
  /** Called with the new text each time it changes. */
  onValueChange?: (value: string) => void;
  /** Native textarea props. `form` associates text and Send with that external form's validation, submission and reset. */
  inputProps?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'children' | 'dangerouslySetInnerHTML'>;
  /** Runs only when the composer host form receives an uncancelled submission, with the text. */
  onSend?: (value: string) => void;
  /** Called when Stop is pressed. Stop replaces Send while `pending`, and shows only with this callback. */
  onStop?: () => void;
  /** Makes the text read-only and disables the auxiliary actions. Stop replaces Send when `onStop` is given. */
  pending?: boolean;
  /** Prevents all editing and actions. */
  disabled?: boolean;
  /** A message shown with the composer, associated with the textarea and announced; it also marks the textarea invalid. */
  error?: ReactNode;
  /** The records a caret token beginning with @ at a word boundary suggests. Up and Down choose, Enter inserts, and Escape dismisses. */
  sources?: readonly PromptComposerSuggestion[];
  /** The records a caret token beginning with / at a word boundary suggests. Up and Down choose, Enter inserts, and Escape dismisses. */
  commands?: readonly PromptComposerSuggestion[];
  /** Called with the chosen record and its kind when a suggestion is inserted. Insertion replaces only the current token, respects `maxLength`, and never sends. */
  onSuggestionSelect?: (item: PromptComposerSuggestion, kind: 'source' | 'command') => void;
  /** Display records for the files attached. Each shows with a remove button when `onRemoveAttachment` is given. */
  attachments?: readonly PromptComposerAttachment[];
  /** Called with the id of an attachment whose remove button was pressed. */
  onRemoveAttachment?: (id: string) => void;
  /** Shows an attach button that opens a native file picker, and receives the chosen files. Nothing is uploaded. */
  onFilesSelected?: (files: File[]) => void;
  /** The file types the attach picker accepts, as the native input's `accept`. */
  accept?: string;
  /** Whether the attach picker admits several files. */
  multiple?: boolean;
  /** The models the picker offers. It renders only with `models` and `onModelChange`. */
  models?: readonly PromptComposerModel[];
  /** The id of the selected model, when the caller controls it. */
  selectedModel?: string;
  /** The id of the model selected at first, when the composer controls itself; without one, the first model. A form reset restores it. */
  defaultSelectedModel?: string;
  /** Called with the id of the chosen model. */
  onModelChange?: (id: string) => void;
  /** Shows a dictation button that calls this when pressed. Mux UI performs no recognition. */
  onDictation?: () => void;
};

// Only the names the composer replaces leave the form's attributes: children and dangerouslySetInnerHTML, which it discards, and
// defaultValue, the one owned name the form also declares, whose string the composer narrows. Every other owned name stays
// intersected with the form's member of that name, so a consumer's augmentation of React's FormHTMLAttributes still constrains it.
export type PromptComposerProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'children' | 'dangerouslySetInnerHTML' | 'defaultValue'> & PromptComposerOwnProps & { inputRef?: Ref<HTMLTextAreaElement> };

// Props the form does not publish. The component destructures them so a value an untyped caller passes never reaches the form.
type DiscardedPromptComposerProps = { children?: unknown; dangerouslySetInnerHTML?: unknown };

/** A caret token that starts a suggestion: its kind, the text after the trigger character, and where it sits in the text. */
type SuggestionTrigger = { kind: 'source' | 'command'; query: string; start: number; end: number; text: string };

const e = React.createElement;
const modelKeyPrefix = 'model:';
const px = (value: string) => Number.parseFloat(value) || 0;
function triggerAt(node: HTMLTextAreaElement | null): SuggestionTrigger | null {
  if (!node || node.selectionStart !== node.selectionEnd) return null;
  const position = node.selectionStart;
  const match = /(?:^|\s)([@/])([^\s@/]*)$/u.exec(node.value.slice(0, position));
  return match ? { kind: match[1] === '@' ? 'source' : 'command', query: match[2], start: position - match[2].length - 1, end: position, text: node.value } : null;
}
function sameTrigger(left: SuggestionTrigger | null, right: SuggestionTrigger | null) {
  return left?.kind === right?.kind && left?.query === right?.query && left?.start === right?.start && left?.end === right?.end && left?.text === right?.text;
}


/** Native form host; Enter submits through native validation, Shift+Enter adds a line. Presentation and local editing only: files, models, requests and dictation stay caller-owned. */
export const PromptComposer: ForwardRefExoticComponent<PromptComposerProps & RefAttributes<HTMLFormElement>> = React.forwardRef<HTMLFormElement, PromptComposerProps & DiscardedPromptComposerProps>(function PromptComposer({
  inputLabel = 'Message', value, defaultValue = '', onValueChange, inputProps: suppliedInputProps, inputRef,
  onSend, onStop, pending = false, disabled = false, error, sources: suppliedSources, commands: suppliedCommands, onSuggestionSelect,
  attachments: suppliedAttachments, onRemoveAttachment, onFilesSelected, accept, multiple = true,
  models: suppliedModels, selectedModel, defaultSelectedModel, onModelChange, onDictation,
  onSubmit, onReset, onResetCapture, className, children: _children, dangerouslySetInnerHTML: _dangerouslySetInnerHTML, ...props
}, ref) {
  // Undefined-only fallbacks in the body: an empty container is no executed default to state, and a null stays a null.
  const inputProps: Required<PromptComposerOwnProps>['inputProps'] = suppliedInputProps === undefined ? {} : suppliedInputProps;
  const sources = suppliedSources === undefined ? [] : suppliedSources;
  const commands = suppliedCommands === undefined ? [] : suppliedCommands;
  const attachments = suppliedAttachments === undefined ? [] : suppliedAttachments;
  const models = suppliedModels === undefined ? [] : suppliedModels;
  // Conditionals, not ?? and || on the owned props: extraction reads a fallback on an owned prop as an executed default.
  const [localValue, setLocalValue] = React.useState(defaultValue);
  const [localModel, setLocalModel] = React.useState(defaultSelectedModel === undefined || defaultSelectedModel === null ? (models[0]?.id ?? '') : defaultSelectedModel);
  const [modelOpen, setModelOpen] = React.useState(false);
  const text = value === undefined || value === null ? localValue : value;
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const suggestions = React.useRef<HTMLDivElement>(null);
  const sendIcon = React.useRef<HTMLSpanElement>(null);
  useCandidateMotion(sendIcon, pending);
  const files = React.useRef<HTMLInputElement>(null);
  const resettingModel = React.useRef(false);
  const composing = React.useRef(false);
  const caret = React.useRef<number | null>(null);
  const [trigger, setTrigger] = React.useState<SuggestionTrigger | null>(null);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [menu, setMenu] = React.useState<{ placement: 'above' | 'below'; height: number }>({ placement: 'above', height: 256 });
  const id = React.useId();
  const locked = disabled ? disabled : Boolean(inputProps.disabled);
  const readonly = pending ? pending : Boolean(inputProps.readOnly);
  const hasModelPicker = models.length > 0 && Boolean(onModelChange);
  const modelValue = selectedModel === undefined || selectedModel === null ? (models.some((model) => model.id === localModel) ? localModel : models[0]?.id ?? '') : selectedModel;
  React.useLayoutEffect(() => { if (locked || pending || !hasModelPicker) setModelOpen(false); }, [locked, pending, hasModelPicker]);
  // The handle is the textarea, or null before it mounts, as the ref reports it.
  React.useImperativeHandle(inputRef, () => textarea.current as HTMLTextAreaElement);
  function fitInput() {
    const node = textarea.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }
  React.useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    fitInput();
    if (caret.current !== null) { node.setSelectionRange(caret.current, caret.current); caret.current = null; }
    if (trigger && trigger.text !== text) setTrigger(null);
  }, [text, inputProps.placeholder]);
  React.useLayoutEffect(() => {
    const node = textarea.current;
    const view = node?.ownerDocument.defaultView;
    if (!node || !view) return;
    let width = node.getBoundingClientRect().width;
    const resize = () => {
      const next = node.getBoundingClientRect().width;
      if (next === width) return;
      width = next;
      fitInput();
    };
    if (view.ResizeObserver) {
      const observer = new view.ResizeObserver(resize);
      observer.observe(node);
      return () => observer.disconnect();
    }
    view.addEventListener('resize', resize);
    return () => view.removeEventListener('resize', resize);
  }, []);
  function change(next: string) {
    if (value === undefined) setLocalValue(next);
    onValueChange?.(next);
  }
  function resetText() {
    if (value === undefined) change(defaultValue);
    textarea.current!.value = value === undefined || value === null ? defaultValue : value;
    caret.current = null;
    setTrigger(null);
    fitInput();
  }
  React.useEffect(() => {
    const node = textarea.current;
    const form = node?.form;
    if (!form || form === node.closest('form')) return;
    // A reset on the associated form cannot bubble through the composer host.
    const reset = (event: Event) => queueMicrotask(() => {
      if (!event.defaultPrevented && textarea.current?.form === form) resetText();
    });
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [inputProps.form, value, defaultValue, onValueChange]);
  function updateTrigger(node: HTMLTextAreaElement | null) {
    const next = triggerAt(node);
    if (!sameTrigger(next, trigger)) {
      setTrigger(next);
      setActive(0);
      setDismissed(false);
    }
  }
  const candidates = trigger?.kind === 'source' ? sources : commands;
  const options = trigger ? candidates.filter((item) => item.label.toLocaleLowerCase().includes(trigger.query.toLocaleLowerCase())) : [];
  const open = Boolean(trigger && trigger.text === text && !dismissed && !locked && !readonly && options.length);
  useCandidateMotion(suggestions, open, { active: open, reveal: true, triggerRef: textarea });
  const index = Math.min(active, Math.max(0, options.length - 1));
  React.useLayoutEffect(() => {
    if (!open) return;
    const node = textarea.current;
    const view = node?.ownerDocument.defaultView;
    const list = node?.ownerDocument.getElementById(`${id}-suggestions`);
    if (!node || !view || !list) return;
    const place = () => {
      const form = node.closest('form')!;
      const rect = form.getBoundingClientRect();
      const formStyle = view.getComputedStyle(form);
      const listStyle = view.getComputedStyle(list);
      // The menu is anchored to the form's padding box, so its borders move the anchors inward.
      const anchorTop = rect.top + px(formStyle.borderTopWidth);
      const anchorBottom = rect.bottom - px(formStyle.borderBottomWidth);
      // The anchored inset resolves to the padding-box height plus the gap, so the rest is the gap.
      const gap = Math.max(0, px(list.dataset.muxuiPlacement === 'below' ? listStyle.top : listStyle.bottom) - (anchorBottom - anchorTop));
      const frame = px(listStyle.borderTopWidth) + px(listStyle.borderBottomWidth);
      const top = view.visualViewport?.offsetTop ?? 0;
      const height = view.visualViewport?.height ?? view.innerHeight;
      const above = Math.max(0, anchorTop - gap - top - 4);
      const below = Math.max(0, top + height - anchorBottom - gap - 4);
      const wanted = Math.min(256, list.scrollHeight + frame);
      const placement = above >= wanted || above >= below ? 'above' : 'below';
      const available = placement === 'above' ? above : below;
      const next = { placement, height: Math.min(256, available) } as const;
      setMenu((current) => current.placement === next.placement && current.height === next.height ? current : next);
    };
    place();
    view.addEventListener('resize', place);
    view.addEventListener('scroll', place, true);
    view.visualViewport?.addEventListener('resize', place);
    view.visualViewport?.addEventListener('scroll', place);
    return () => { view.removeEventListener('resize', place); view.removeEventListener('scroll', place, true); view.visualViewport?.removeEventListener('resize', place); view.visualViewport?.removeEventListener('scroll', place); };
  }, [open, id, trigger?.query, candidates]);
  React.useLayoutEffect(() => {
    if (!open) return;
    const option = textarea.current?.ownerDocument.getElementById(`${id}-option-${index}`);
    const list = option?.parentElement;
    if (!option || !list) return;
    const row = option.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
    if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }, [open, index, id, menu.height, menu.placement]);
  function choose(item: PromptComposerSuggestion) {
    if (!trigger || locked || readonly) return;
    const current = triggerAt(textarea.current);
    if (!current || !sameTrigger(current, trigger) || current.text !== text || !options.includes(item)) {
      updateTrigger(textarea.current);
      return;
    }
    const insertion = item.insertText ?? `${trigger.kind === 'source' ? '@' : '/'}${item.label} `;
    const next = text.slice(0, trigger.start) + insertion + text.slice(trigger.end);
    const limit = inputProps.maxLength;
    if (typeof limit === 'number' && limit >= 0 && next.length > limit) return;
    caret.current = trigger.start + insertion.length;
    change(next);
    onSuggestionSelect?.(item, trigger.kind);
    setTrigger(null);
    setDismissed(true);
    textarea.current?.focus();
  }
  const canSend = Boolean(onSend || onSubmit);
  const submit = (event: FormSubmitEvent<HTMLFormElement>) => {
    onSubmit?.(event);
    const cancelled = event.defaultPrevented;
    // Always keep this local form on the current page, including native-only handlers.
    event.preventDefault();
    if (!cancelled && !locked && !pending && text.trim()) onSend?.(text);
  };
  // React's types do not name the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
  return e('form', { ...props, ref, className: ['muxui-prompt-composer', className].filter(Boolean).join(' '), ...{ 'data-muxui-state-pending': pending ? pending : undefined, 'data-muxui-state-disabled': locked || undefined, 'data-muxui-state-invalid': Boolean(error) || inputProps['aria-invalid'] === true || inputProps['aria-invalid'] === 'true' || undefined },
    onSubmit: submit,
    onResetCapture: (event) => {
      // Select's hidden native field resets before bubbling reaches onReset.
      resettingModel.current = true;
      queueMicrotask(() => { resettingModel.current = false; });
      onResetCapture?.(event);
    },
    onReset: (event) => {
      onReset?.(event);
      const host = event.currentTarget;
      // Let ancestor handlers cancel and the browser finish its native reset first.
      queueMicrotask(() => {
        if (event.defaultPrevented || event.nativeEvent.defaultPrevented || !textarea.current) return;
        if (textarea.current.form === host) resetText();
        const nextModel = selectedModel === undefined || selectedModel === null
          ? (defaultSelectedModel === undefined || defaultSelectedModel === null ? (models[0]?.id ?? '') : defaultSelectedModel)
          : selectedModel;
        if (selectedModel === undefined) setLocalModel(nextModel);
      });
    },
  },
  open && trigger && e('div', { ref: suggestions, className: 'muxui-prompt-composer__suggestions', ...{ 'data-muxui-placement': menu.placement }, style: { maxBlockSize: menu.height }, role: 'listbox', id: `${id}-suggestions`, 'aria-label': trigger.kind === 'source' ? 'Sources' : 'Commands' },
    options.map((item, position) => e('div', { key: item.id, role: 'option', id: `${id}-option-${position}`, 'aria-selected': position === index, className: 'muxui-prompt-composer__option',
      onPointerDown: (event) => event.preventDefault(), onClick: () => choose(item),
    }, e('span', { className: 'muxui-prompt-composer__option-symbol', 'aria-hidden': true }, trigger.kind === 'source' ? '@' : '/'),
    e('span', null, e('span', { className: 'muxui-prompt-composer__option-label' }, item.label), item.description && e('span', { className: 'muxui-prompt-composer__option-description' }, item.description))))),
  attachments.length > 0 && e('ul', { className: 'muxui-prompt-composer__attachments', 'aria-label': 'Attachments' }, attachments.map((item) => e('li', { key: item.id }, e('span', null, item.label), onRemoveAttachment && e('button', { ...{ 'data-muxui-size': 'sm', 'data-muxui-variant': 'ghost', 'data-muxui-icon-button': '' }, className: 'muxui-button muxui-icon-button', type: 'button', disabled: locked || pending, ...{ 'data-muxui-state-disabled': locked || pending || undefined }, 'aria-label': `Remove ${item.label}`, onClick: () => onRemoveAttachment(item.id) }, e('span', { className: 'muxui-icon-button__icon', 'aria-hidden': true }, e(X, { 'aria-hidden': true, focusable: 'false' })))))),
  e('div', { className: 'muxui-prompt-composer__field' },
    onFilesSelected && e(React.Fragment, null,
      e('input', { type: 'file', ref: files, hidden: true, accept, multiple, disabled: locked || pending, onChange: (event) => { const selected = Array.from(event.currentTarget.files ?? []); if (selected.length) onFilesSelected(selected); event.currentTarget.value = ''; } }),
      e('button', { ...{ 'data-muxui-size': 'sm', 'data-muxui-variant': 'ghost', 'data-muxui-icon-button': '' }, type: 'button', className: 'muxui-button muxui-icon-button muxui-prompt-composer__button', disabled: locked || pending, ...{ 'data-muxui-state-disabled': locked || pending || undefined }, 'aria-label': 'Attach files', onClick: () => files.current?.click() }, e('span', { className: 'muxui-icon-button__icon', 'aria-hidden': true }, e(Plus, { 'aria-hidden': true, focusable: 'false' })))),
    e('textarea', { ...inputProps, ref: textarea, className: ['muxui-prompt-composer__input', inputProps.className].filter(Boolean).join(' '), value: text, rows: inputProps.rows ?? 1, disabled: locked, readOnly: readonly,
      'aria-label': inputProps['aria-label'] ?? (inputProps['aria-labelledby'] ? undefined : inputLabel),
      'aria-describedby': [inputProps['aria-describedby'], error ? `${id}-error` : null, open ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined,
      'aria-invalid': error ? true : inputProps['aria-invalid'],
      'aria-autocomplete': open ? 'list' : undefined, 'aria-haspopup': open ? 'listbox' : undefined,
      'aria-controls': open ? `${id}-suggestions` : undefined, 'aria-activedescendant': open ? `${id}-option-${index}` : undefined,
      onChange: (event) => { inputProps.onChange?.(event); change(event.currentTarget.value); updateTrigger(event.currentTarget); },
      onSelect: (event) => { inputProps.onSelect?.(event); if (!composing.current) updateTrigger(event.currentTarget); },
      onBlur: (event) => { inputProps.onBlur?.(event); setDismissed(true); },
      onCompositionStart: (event) => { composing.current = true; inputProps.onCompositionStart?.(event); },
      onCompositionEnd: (event) => { composing.current = false; inputProps.onCompositionEnd?.(event); updateTrigger(event.currentTarget); },
      onKeyDown: (event) => {
        inputProps.onKeyDown?.(event);
        if (event.defaultPrevented || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setActive((position) => (position + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
        else if (open && event.key === 'Escape') { event.preventDefault(); setDismissed(true); }
        else if (open && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); choose(options[index]); }
        else if (event.key === 'Enter' && !event.shiftKey && !locked && !readonly && canSend) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      },
    }),
    e('div', { className: 'muxui-prompt-composer__controls' },
      hasModelPicker && e(Select, { size: 'sm', className: 'muxui-prompt-composer__model', 'aria-label': 'Model', items: models.map((model) => ({ id: modelKeyPrefix + model.id, label: model.label })), value: modelKeyPrefix + modelValue, open: modelOpen && !locked && !pending, onOpenChange: setModelOpen, disabled: locked || pending, onChange: (next) => {
        if (next === undefined || locked || pending || resettingModel.current) return;
        // Nonempty private keys preserve caller IDs that Select would normalize.
        const model = models.find((model) => modelKeyPrefix + model.id === next);
        if (!model) return;
        if (selectedModel === undefined) setLocalModel(model.id);
        onModelChange!(model.id);
      } }),
      onDictation && e('button', { ...{ 'data-muxui-size': 'sm', 'data-muxui-variant': 'ghost', 'data-muxui-icon-button': '' }, type: 'button', className: 'muxui-button muxui-icon-button muxui-prompt-composer__button', disabled: locked || pending, ...{ 'data-muxui-state-disabled': locked || pending || undefined }, 'aria-label': 'Start dictation', onClick: onDictation }, e('span', { className: 'muxui-icon-button__icon', 'aria-hidden': true }, e(Mic, { 'aria-hidden': true, focusable: 'false' }))),
      pending ? onStop && e('button', { ...{ 'data-muxui-size': 'sm', 'data-muxui-variant': 'primary' }, type: 'button', ...{ 'data-muxui-icon-button': '' }, className: 'muxui-button muxui-icon-button muxui-prompt-composer__send', disabled: locked, ...{ 'data-muxui-state-disabled': locked || undefined }, 'aria-label': 'Stop response', onClick: onStop }, e('span', { ref: sendIcon, className: 'muxui-icon-button__icon', 'aria-hidden': true }, e(Square, { 'aria-hidden': true, focusable: 'false' })))
        : canSend && e('button', { ...{ 'data-muxui-size': 'sm', 'data-muxui-variant': 'primary' }, type: 'submit', form: inputProps.form, ...{ 'data-muxui-icon-button': '' }, className: 'muxui-button muxui-icon-button muxui-prompt-composer__send', disabled: locked || readonly || !text.trim(), ...{ 'data-muxui-state-disabled': locked || readonly || !text.trim() || undefined }, 'aria-label': 'Send message' }, e('span', { ref: sendIcon, className: 'muxui-icon-button__icon', 'aria-hidden': true }, e(ArrowUp, { 'aria-hidden': true, focusable: 'false' }))))),
  open && e('span', { className: 'muxui-prompt-composer__status', id: `${id}-hint` }, 'Use Up and Down to choose a suggestion, Enter to insert, and Escape to dismiss.'),
  error && e('p', { className: 'muxui-prompt-composer__error', id: `${id}-error`, role: 'alert' }, error),
  e('span', { className: 'muxui-prompt-composer__status', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, pending ? 'Response in progress.' : ''));
});
PromptComposer.displayName = 'PromptComposer';
