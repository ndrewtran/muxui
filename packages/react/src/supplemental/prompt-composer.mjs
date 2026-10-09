import React from 'react';
import { Select } from '../collections.mjs';
import Plus from 'lucide-react/dist/esm/icons/plus.mjs';
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up.mjs';
import Square from 'lucide-react/dist/esm/icons/square.mjs';
import Mic from 'lucide-react/dist/esm/icons/mic.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';

const e = React.createElement;
const modelKeyPrefix = 'model:';
function triggerAt(node) {
  if (!node || node.selectionStart !== node.selectionEnd) return null;
  const position = node.selectionStart;
  const match = /(?:^|\s)([@/])([^\s@/]*)$/u.exec(node.value.slice(0, position));
  return match ? { kind: match[1] === '@' ? 'source' : 'command', query: match[2], start: position - match[2].length - 1, end: position, text: node.value } : null;
}
function sameTrigger(left, right) {
  return left?.kind === right?.kind && left?.query === right?.query && left?.start === right?.start && left?.end === right?.end && left?.text === right?.text;
}


/** Presentation and local editing only. Files, models, requests and dictation stay caller-owned. */
export const PromptComposer = React.forwardRef(function PromptComposer({
  inputLabel = 'Message', value, defaultValue = '', onValueChange, inputProps = {}, inputRef,
  onSend, onStop, pending = false, disabled = false, error, sources = [], commands = [], onSuggestionSelect,
  attachments = [], onRemoveAttachment, onFilesSelected, accept, multiple = true,
  models = [], selectedModel, defaultSelectedModel, onModelChange, onDictation,
  onSubmit, onReset, onResetCapture, className, children, dangerouslySetInnerHTML, ...props
}, ref) {
  const [localValue, setLocalValue] = React.useState(defaultValue);
  const [localModel, setLocalModel] = React.useState(defaultSelectedModel ?? models[0]?.id ?? '');
  const [modelOpen, setModelOpen] = React.useState(false);
  const text = value ?? localValue;
  const textarea = React.useRef(null);
  const suggestions = React.useRef(null);
  const sendIcon = React.useRef(null);
  useCandidateMotion(sendIcon, pending);
  const files = React.useRef(null);
  const resettingModel = React.useRef(false);
  const composing = React.useRef(false);
  const caret = React.useRef(null);
  const [trigger, setTrigger] = React.useState(null);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [menu, setMenu] = React.useState({ placement: 'above', height: 256 });
  const id = React.useId();
  const locked = disabled || Boolean(inputProps.disabled);
  const readonly = pending || Boolean(inputProps.readOnly);
  const hasModelPicker = models.length > 0 && Boolean(onModelChange);
  const modelValue = selectedModel ?? (models.some((model) => model.id === localModel) ? localModel : models[0]?.id ?? '');
  React.useLayoutEffect(() => { if (locked || pending || !hasModelPicker) setModelOpen(false); }, [locked, pending, hasModelPicker]);
  React.useImperativeHandle(inputRef, () => textarea.current);
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
  function change(next) {
    if (value === undefined) setLocalValue(next);
    onValueChange?.(next);
  }
  function resetText() {
    if (value === undefined) change(defaultValue);
    textarea.current.value = value ?? defaultValue;
    caret.current = null;
    setTrigger(null);
    fitInput();
  }
  React.useEffect(() => {
    const node = textarea.current;
    const form = node?.form;
    if (!form || form === node.closest('form')) return;
    // A reset on the associated form cannot bubble through the composer host.
    const reset = (event) => queueMicrotask(() => {
      if (!event.defaultPrevented && textarea.current?.form === form) resetText();
    });
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [inputProps.form, value, defaultValue, onValueChange]);
  function updateTrigger(node) {
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
      const rect = node.closest('form').getBoundingClientRect();
      const top = view.visualViewport?.offsetTop ?? 0;
      const height = view.visualViewport?.height ?? view.innerHeight;
      const above = Math.max(0, rect.top - top - 4);
      const below = Math.max(0, top + height - rect.bottom - 4);
      const wanted = Math.min(256, list.scrollHeight);
      const placement = above >= wanted || above >= below ? 'above' : 'below';
      const available = placement === 'above' ? above : below;
      const next = { placement, height: Math.min(256, available) };
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
  function choose(item) {
    if (!trigger || locked || readonly) return;
    const current = triggerAt(textarea.current);
    if (!sameTrigger(current, trigger) || current.text !== text || !options.includes(item)) {
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
  const submit = (event) => {
    onSubmit?.(event);
    const cancelled = event.defaultPrevented;
    // Always keep this local form on the current page, including native-only handlers.
    event.preventDefault();
    if (!cancelled && !locked && !pending && text.trim()) onSend?.(text);
  };
  return e('form', { ...props, ref, className: ['muxui-prompt-composer', className].filter(Boolean).join(' '), 'data-pending': pending || undefined, 'data-disabled': locked || undefined, 'data-invalid': Boolean(error) || inputProps['aria-invalid'] === true || inputProps['aria-invalid'] === 'true' || undefined,
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
        const nextModel = selectedModel ?? defaultSelectedModel ?? models[0]?.id ?? '';
        if (selectedModel === undefined) setLocalModel(nextModel);
      });
    },
  },
  open && e('div', { ref: suggestions, className: 'muxui-prompt-composer-suggestions', 'data-placement': menu.placement, style: { maxBlockSize: menu.height }, role: 'listbox', id: `${id}-suggestions`, 'aria-label': trigger.kind === 'source' ? 'Sources' : 'Commands' },
    options.map((item, position) => e('div', { key: item.id, role: 'option', id: `${id}-option-${position}`, 'aria-selected': position === index, className: 'muxui-prompt-composer-option',
      onPointerDown: (event) => event.preventDefault(), onClick: () => choose(item),
    }, e('span', { className: 'muxui-prompt-composer-option-symbol', 'aria-hidden': true }, trigger.kind === 'source' ? '@' : '/'),
    e('span', null, e('span', { className: 'muxui-prompt-composer-option-label' }, item.label), item.description && e('span', { className: 'muxui-prompt-composer-option-description' }, item.description))))),
  attachments.length > 0 && e('ul', { className: 'muxui-prompt-composer-attachments', 'aria-label': 'Attachments' }, attachments.map((item) => e('li', { key: item.id }, e('span', null, item.label), onRemoveAttachment && e('button', { 'data-size': 'sm', 'data-variant': 'ghost', 'data-muxui-icon-button': '', className: 'muxui-button muxui-icon-button', type: 'button', disabled: locked || pending, 'data-disabled': locked || pending || undefined, 'aria-label': `Remove ${item.label}`, onClick: () => onRemoveAttachment(item.id) }, e('span', { className: 'muxui-icon-button-icon', 'aria-hidden': true }, e(X, { 'aria-hidden': true, focusable: 'false' })))))),
  e('div', { className: 'muxui-prompt-composer-field' },
    onFilesSelected && e(React.Fragment, null,
      e('input', { type: 'file', ref: files, hidden: true, accept, multiple, disabled: locked || pending, onChange: (event) => { const selected = Array.from(event.currentTarget.files ?? []); if (selected.length) onFilesSelected(selected); event.currentTarget.value = ''; } }),
      e('button', { 'data-size': 'sm', 'data-variant': 'ghost', 'data-muxui-icon-button': '', type: 'button', className: 'muxui-button muxui-icon-button muxui-prompt-composer-button', disabled: locked || pending, 'data-disabled': locked || pending || undefined, 'aria-label': 'Attach files', onClick: () => files.current?.click() }, e('span', { className: 'muxui-icon-button-icon', 'aria-hidden': true }, e(Plus, { 'aria-hidden': true, focusable: 'false' })))),
    e('textarea', { ...inputProps, ref: textarea, className: ['muxui-prompt-composer-input', inputProps.className].filter(Boolean).join(' '), value: text, rows: inputProps.rows ?? 1, disabled: locked, readOnly: readonly,
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
    e('div', { className: 'muxui-prompt-composer-controls' },
      hasModelPicker && e(Select, { size: 'sm', className: 'muxui-prompt-composer-model', 'aria-label': 'Model', items: models.map((model) => ({ id: modelKeyPrefix + model.id, label: model.label })), value: modelKeyPrefix + modelValue, open: modelOpen && !locked && !pending, onOpenChange: setModelOpen, disabled: locked || pending, onChange: (next) => {
        if (next === undefined || locked || pending || resettingModel.current) return;
        // Nonempty private keys preserve caller IDs that Select would normalize.
        const model = models.find((model) => modelKeyPrefix + model.id === next);
        if (!model) return;
        if (selectedModel === undefined) setLocalModel(model.id);
        onModelChange(model.id);
      } }),
      onDictation && e('button', { 'data-size': 'sm', 'data-variant': 'ghost', 'data-muxui-icon-button': '', type: 'button', className: 'muxui-button muxui-icon-button muxui-prompt-composer-button', disabled: locked || pending, 'data-disabled': locked || pending || undefined, 'aria-label': 'Start dictation', onClick: onDictation }, e('span', { className: 'muxui-icon-button-icon', 'aria-hidden': true }, e(Mic, { 'aria-hidden': true, focusable: 'false' }))),
      pending ? onStop && e('button', { 'data-size': 'sm', 'data-variant': 'primary', type: 'button', 'data-muxui-icon-button': '', className: 'muxui-button muxui-icon-button muxui-prompt-composer-send', disabled: locked, 'data-disabled': locked || undefined, 'aria-label': 'Stop response', onClick: onStop }, e('span', { ref: sendIcon, className: 'muxui-icon-button-icon', 'aria-hidden': true }, e(Square, { 'aria-hidden': true, focusable: 'false' })))
        : canSend && e('button', { 'data-size': 'sm', 'data-variant': 'primary', type: 'submit', form: inputProps.form, 'data-muxui-icon-button': '', className: 'muxui-button muxui-icon-button muxui-prompt-composer-send', disabled: locked || readonly || !text.trim(), 'data-disabled': locked || readonly || !text.trim() || undefined, 'aria-label': 'Send message' }, e('span', { ref: sendIcon, className: 'muxui-icon-button-icon', 'aria-hidden': true }, e(ArrowUp, { 'aria-hidden': true, focusable: 'false' }))))),
  open && e('span', { className: 'muxui-prompt-composer-sr-only', id: `${id}-hint` }, 'Use Up and Down to choose a suggestion, Enter to insert, and Escape to dismiss.'),
  error && e('p', { className: 'muxui-prompt-composer-error', id: `${id}-error`, role: 'alert' }, error),
  e('span', { className: 'muxui-prompt-composer-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, pending ? 'Response in progress.' : ''));
});
PromptComposer.displayName = 'PromptComposer';
