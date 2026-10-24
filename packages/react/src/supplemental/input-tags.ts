import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, KeyboardEvent, ReactNode, RefAttributes } from 'react';
import {
  Group as AriaGroup,
  Input as AriaInput,
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
} from 'react-aria-components';
import type { Key } from 'react-aria-components';
import { h, cx, dataState } from './part-utils.ts';

/**
 * The props Mux UI defines for InputTags.Root, the compound's one part; the catalog's web.react
 * API is derived from this type (Decision 0031). The members every field shares are written out,
 * because the catalog's grammar reads only the members a type lists itself.
 */
type InputTagsOwnProps = {
  /** Where the tags sit: inline with the input, or below it. */
  tagPlacement?: 'inline' | 'below';
  /** The field's size. */
  size?: 'sm' | 'md' | 'lg';
  /** The hint shown in the input while it is empty, and beside the tags when they sit below. */
  placeholder?: string;
  /** The tags, when the caller controls them. */
  value?: string[];
  /** The starting tags, when the field controls itself. */
  defaultValue?: string[];
  /** Called with all of the tags each time one is added or removed. */
  onChange?: (tags: string[]) => void;
  /** Called with the tag that was just added. */
  onTagAdded?: (tag: string) => void;
  /** Called with the tag that was just removed. */
  onTagRemoved?: (tag: string) => void;
  /** Lets the same tag be added more than once. */
  allowDuplicates?: boolean;
  /** The most tags the field holds; adding another does nothing. */
  maxTags?: number;
  /** Decides whether a typed tag may be added. */
  validate?: (value: string) => boolean;
  /** The visible label, which also names the input. */
  label?: ReactNode;
  /** Supporting text shown with the field. */
  description?: ReactNode;
  /** The message shown, in place of the description, while the field is invalid. */
  errorMessage?: ReactNode;
  /** Marks the field disabled. */
  disabled?: boolean;
  /** Marks the field invalid. */
  invalid?: boolean;
  /** Marks the field required. */
  required?: boolean;
};

// readOnly stays in the public type, though InputTags does nothing with it and it reaches the root element as an attribute.
export type InputTagsProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & InputTagsOwnProps & { readOnly?: boolean };
export type InputTagsRootProps = InputTagsProps;

type Entry = { id: string; label: string };

/* InputTags */
const InputTagsRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, InputTagsProps>(function InputTagsRoot({
  tagPlacement = 'inline', size = 'md', placeholder, disabled = false, invalid = false, required = false,
  value, defaultValue = [], onChange, onTagAdded, onTagRemoved, allowDuplicates = false, maxTags, validate,
  label, description, errorMessage, className,
  'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, 'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid, 'aria-required': ariaRequired, ...props
}, ref) {
  const controlled = value !== undefined;
  const instanceId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '') || 'input-tags';
  const idCounter = React.useRef(0);
  const nextId = React.useCallback(() => `tag-${idCounter.current += 1}`, []);
  const [internalEntries, setInternalEntries] = React.useState<Entry[]>(() => defaultValue.map((labelText) => ({ id: nextId(), label: labelText })));
  const controlledEntries = React.useRef<Entry[]>([]);
  const previousValue = React.useRef<string[] | undefined>(undefined);
  const entries = React.useMemo(() => {
    if (!controlled) return internalEntries;
    if (previousValue.current === value) return controlledEntries.current;
    const oldEntries = controlledEntries.current;
    const used = new Set<number>();
    const nextEntries = (value === undefined || value === null ? [] : value).map((labelText) => {
      const oldIndex = oldEntries.findIndex((entry, index) => entry.label === labelText && !used.has(index));
      if (oldIndex >= 0) {
        used.add(oldIndex);
        return oldEntries[oldIndex];
      }
      return { id: nextId(), label: labelText };
    });
    previousValue.current = value;
    controlledEntries.current = nextEntries;
    return nextEntries;
  }, [controlled, internalEntries, nextId, value]);
  const tags = entries.map((entry) => entry.label);
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const tagListRef = React.useRef<HTMLDivElement | null>(null);
  const updateEntries = React.useCallback((nextEntries: Entry[], added?: string, removed?: string) => {
    if (!controlled) setInternalEntries(nextEntries);
    onChange?.(nextEntries.map((entry) => entry.label));
    if (added) onTagAdded?.(added);
    if (removed) onTagRemoved?.(removed);
  }, [controlled, onChange, onTagAdded, onTagRemoved]);
  const add = React.useCallback(() => {
    const nextTag = inputValue.trim();
    if (!nextTag || (!allowDuplicates && tags.includes(nextTag)) || (maxTags !== undefined && tags.length >= maxTags) || (validate && !validate(nextTag))) return false;
    updateEntries([...entries, { id: nextId(), label: nextTag }], nextTag);
    setInputValue('');
    return true;
  }, [allowDuplicates, entries, inputValue, maxTags, nextId, tags, updateEntries, validate]);
  const removeById = React.useCallback((id: Key) => {
    const entry = entries.find((candidate) => candidate.id === String(id));
    if (!entry) return;
    updateEntries(entries.filter((candidate) => candidate.id !== entry.id), undefined, entry.label);
  }, [entries, updateEntries]);
  const handleTagRemove = React.useCallback((keys: Set<Key>) => {
    [...keys].forEach((key) => removeById(key));
    if (entries.length <= keys.size) setTimeout(() => inputRef.current?.focus(), 0);
  }, [entries.length, removeById]);
  const handleTagListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight') return;
    const tagsInDom = tagListRef.current?.querySelectorAll('[role="row"]');
    const lastTag = tagsInDom?.[tagsInDom.length - 1];
    if (lastTag && (document.activeElement === lastTag || lastTag.contains(document.activeElement))) inputRef.current?.focus();
  };
  const tagsNode = entries.length > 0 && h('div', { ref: tagListRef, onKeyDown: handleTagListKeyDown, className: 'muxui-input-tags__tag-wrapper' }, h(AriaTagGroup, { 'aria-label': typeof label === 'string' ? label : 'Tags', onRemove: handleTagRemove, className: 'muxui-input-tags__tag-group' }, h(AriaTagList<Entry>, { items: entries, className: 'muxui-input-tags__tag-list', children: (entry) => h(AriaTag, { id: entry.id, isDisabled: disabled, className: 'muxui-input-tags__tag' }, entry.label) })));
  const labelId = label ? `muxui-input-tags-label-${instanceId}` : undefined;
  const inputId = `muxui-input-tags-input-${instanceId}`;
  const descriptionId = `muxui-input-tags-description-${instanceId}`;
  const errorId = `muxui-input-tags-error-${instanceId}`;
  const supportingText = invalid && errorMessage
    ? { id: errorId, className: 'muxui-input-tags__error', children: errorMessage }
    : description
      ? { id: descriptionId, className: 'muxui-input-tags__description', children: description }
      : undefined;
  const describedby = [ariaDescribedby, supportingText?.id].filter(Boolean).join(' ') || undefined;
  const inputAriaProps = ariaLabel !== undefined
    ? { 'aria-label': ariaLabel }
    : ariaLabelledby !== undefined
      ? { 'aria-labelledby': ariaLabelledby }
      : labelId
        ? { 'aria-labelledby': labelId }
        : {};
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && atStart && !inputValue && entries.length > 0) {
      const tagsInDom = tagListRef.current?.querySelectorAll<HTMLElement>('[role="row"]');
      tagsInDom?.[tagsInDom.length - 1]?.focus();
    }
  };
  return h('div', { ...props, ref, className: cx('muxui-input-tags', size !== 'md' && `muxui-input-tags--${size}`, tagPlacement === 'below' && 'muxui-input-tags--below', className), 'data-size': size, 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('label', { id: labelId, htmlFor: inputId, className: 'muxui-input-tags__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), h(AriaGroup, { isDisabled: disabled, isInvalid: invalid, 'aria-labelledby': labelId, 'aria-required': required ? required : undefined, className: 'muxui-input-tags__group' }, tagPlacement === 'inline' && tagsNode, h(AriaInput, { ...inputAriaProps, id: inputId, ref: inputRef, value: inputValue, placeholder: entries.length === 0 || tagPlacement === 'below' ? placeholder : undefined, onChange: (event) => setInputValue(event.target.value), onKeyDown: handleInputKeyDown, className: 'muxui-input-tags__input', disabled, 'aria-describedby': describedby, 'aria-invalid': ariaInvalid ?? (invalid ? invalid : undefined), 'aria-required': ariaRequired ?? (required ? required : undefined) })), tagPlacement === 'below' && tagsNode ? h('div', { className: 'muxui-input-tags__tags' }, tagsNode) : null, supportingText ? h('span', { id: supportingText.id, className: supportingText.className }, supportingText.children) : null);
});

export const InputTags: { Root: ForwardRefExoticComponent<InputTagsProps & RefAttributes<HTMLDivElement>> } = /*#__PURE__*/ Object.freeze({
  Root: InputTagsRoot,
});
