import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, Key, KeyboardEvent, ReactElement, ReactNode, RefAttributes, RefObject } from 'react';
import { useFilter } from 'react-aria-components';
import { AriaComboBox, AriaGroup, AriaInput, AriaListBox, AriaListBoxItem } from '../substrate.ts';
import type { ListBoxItemProps as AriaListBoxItemProps } from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { PopoverMotion } from '../popover-motion.mjs';
import { useMotionLayout, useMotionLifecycle } from '../motion-components.mjs';
import { IconButton } from './icon-button.ts';
import { h, cx, dataState } from './part-utils.ts';
import { defaultItemLabel, useItemRenderer } from './item-renderer.ts';

/** An item TagSelect lists: a key, and whatever else the caller keeps on it. */
export type TagSelectItem = { id: Key; [key: string]: unknown };

/**
 * The props Mux UI defines for TagSelect.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). It is generic over the item the caller lists, as the public type is, and the catalog
 * records the item at its constraint. The members every field shares are written out, because the catalog's grammar
 * reads only the members a type lists itself.
 */
type TagSelectOwnProps<T extends TagSelectItem = TagSelectItem> = {
  /** The control size. */
  size?: 'sm' | 'md' | 'lg';
  /** The visible label, which also names the field. */
  label?: ReactNode;
  /** The text shown in the input while no tag is selected. */
  placeholder?: string;
  /** Supporting text shown below the field. */
  description?: ReactNode;
  /** The message shown, in place of the description, while the field is invalid. */
  errorMessage?: ReactNode;
  /** Marks the field disabled. */
  disabled?: boolean;
  /** Marks a selection as required. */
  required?: boolean;
  /** Marks the field invalid. */
  invalid?: boolean;
  /** The items to choose from. */
  items?: T[];
  /** The selected keys, when the caller controls them. */
  selectedKeys?: Set<Key>;
  /** The keys selected at first, when the field keeps its own selection. */
  defaultSelectedKeys?: Set<Key>;
  /** Called with the new selection each time a tag is added or removed. */
  onSelectionChange?: (keys: Set<Key>) => void;
  /** The text of an item's tag and of its option; an item's name, label, or id when omitted. */
  getItemLabel?: (item: T) => string;
};

// The children are the item elements or a function that renders one for each item, so they stay in the public type with the item, not in the props the catalog lists. readOnly stays too, though TagSelect does nothing with it and it reaches the root element as an attribute.
export type TagSelectProps<T extends TagSelectItem = TagSelectItem> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & TagSelectOwnProps<T> & {
  children?: ReactNode | ((item: T) => ReactNode);
  readOnly?: boolean;
};
export type TagSelectRootProps<T extends TagSelectItem = TagSelectItem> = TagSelectProps<T>;

/** The props Mux UI defines for TagSelect.Item; its API is the item entry in the catalog's partApis. */
type TagSelectItemOwnProps = {
  /** Marks the item disabled: it cannot be selected. */
  disabled?: boolean;
  /** The text that search and typeahead match, when the item's content is not plain text. */
  textValue?: string;
};

export type TagSelectItemProps = HTMLAttributes<HTMLDivElement> & TagSelectItemOwnProps;

export interface TagSelectRootComponent {
  <T extends TagSelectItem = TagSelectItem>(props: TagSelectRootProps<T> & RefAttributes<HTMLDivElement>): ReactElement | null;
}

/* TagSelect */
// The children of a React Aria component that is rendered with its children as arguments, not in its props.
const CHILDREN_FOLLOW = undefined;
const TagSelectContext = React.createContext({ size: 'md' });
const EMPTY_TAG_ITEMS: TagSelectItem[] = Object.freeze([]) as unknown as TagSelectItem[];

function sameTagItems(first: readonly (TagSelectItem | null)[], second: readonly (TagSelectItem | null)[]) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

type AnimatedTagChipProps = {
  item: TagSelectItem;
  index: number;
  active: boolean;
  size: string;
  disabled: boolean;
  label: string;
  tagButtonRefs: RefObject<(HTMLButtonElement | null)[]>;
  onRemove: (key: Key, exiting?: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, key: Key, index: number) => void;
  triggerRef: RefObject<HTMLDivElement | null>;
  layoutKey: number;
};

function AnimatedTagChip({ item, index, active, size, disabled, label, tagButtonRefs, onRemove, onKeyDown, triggerRef, layoutKey }: AnimatedTagChipProps) {
  const nodeRef = React.useRef<HTMLElement | null>(null);
  const lifecycleRef = useMotionLifecycle({
    isOpen: active,
    placement: 'bottom',
    triggerRef,
    onExitComplete: () => onRemove(item.id, true),
  });
  useMotionLayout(nodeRef, layoutKey, triggerRef);
  const setRef = React.useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    lifecycleRef(node);
  }, [lifecycleRef]);
  return h('span', {
    ref: setRef,
    className: `muxui-tag-select__tag muxui-tag-select__tag--${size}`,
    'aria-hidden': active ? undefined : 'true',
    inert: active ? undefined : true,
  }, h('span', { className: 'muxui-tag-select__tag-text' }, label), h(IconButton, {
    ref: (element: HTMLButtonElement | null) => { if (index >= 0) tagButtonRefs.current[index] = element; },
    // React Aria's slot opt-out, which the button's props type does not admit.
    slot: null as unknown as undefined,
    type: 'button',
    tabIndex: -1,
    className: 'muxui-tag-select__tag-remove',
    disabled: disabled || !active,
    'aria-label': `Remove ${label}`,
    onActivate: () => onRemove(item.id),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, item.id, index),
  }, h(XIcon, { size: 14, 'aria-hidden': true, focusable: 'false' })));
}

const TagSelectItemPart: ForwardRefExoticComponent<TagSelectItemProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, TagSelectItemProps>(function TagSelectItem({ disabled = false, textValue, className, ...props }, ref) {
  // The native div attributes reach React Aria's ListBoxItem, whose props type names only its own.
  return h(AriaListBoxItem, { ...(props as AriaListBoxItemProps), textValue, ref, isDisabled: disabled, className: cx('muxui-tag-select__item', className) });
});

const TagSelectRoot: TagSelectRootComponent = /*#__PURE__*/ React.forwardRef<HTMLDivElement, TagSelectProps>(function TagSelectRoot({ size = 'md', label, placeholder, description, errorMessage, disabled = false, required = false, invalid = false, items = EMPTY_TAG_ITEMS, children, selectedKeys: controlledKeys, defaultSelectedKeys, onSelectionChange, getItemLabel, className, ...props }, ref) {
  const resolvedSize = normalizeChoiceControlSize(size, 'TagSelect');
  const controlled = controlledKeys !== undefined;
  const [internal, setInternal] = React.useState(() => new Set(defaultSelectedKeys === undefined || defaultSelectedKeys === null ? [] : defaultSelectedKeys));
  const keys = controlled ? controlledKeys : internal;
  const [query, setQuery] = React.useState('');
  const [popoverWidth, setPopoverWidth] = React.useState('');
  const groupRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const tagButtonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = React.useId();
  const { contains } = useFilter({ sensitivity: 'base' });
  // An omitted getItemLabel labels an item by its name, label, or id.
  const resolveLabel = React.useCallback((item: TagSelectItem) => (getItemLabel === undefined ? defaultItemLabel(item) : getItemLabel(item)), [getItemLabel]);
  const renderItem = useItemRenderer(children, TagSelectItemPart, resolveLabel);
  const itemsById = React.useMemo(() => {
    const map = new Map<Key, TagSelectItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);
  const selectedItems = React.useMemo(
    () => [...keys].map((key) => itemsById.get(key)).filter((item) => item !== undefined),
    [itemsById, keys],
  );
  const selectedIdsRef = React.useRef(new Set<Key>());
  selectedIdsRef.current = new Set(selectedItems.map((item) => item.id));
  const [displayedItems, setDisplayedItems] = React.useState<TagSelectItem[]>(() => selectedItems);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  React.useEffect(() => {
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    setDisplayedItems((current) => {
      const next: (TagSelectItem | null)[] = Array(current.length).fill(null);
      current.forEach((item, index) => {
        if (!selectedIds.has(item.id)) next[index] = item;
      });
      const remaining = [...selectedItems];
      for (let index = 0; index < next.length && remaining.length > 0; index += 1) {
        if (next[index] === null) next[index] = remaining.shift() as TagSelectItem;
      }
      next.push(...remaining);
      if (sameTagItems(current, next)) return current;
      setLayoutVersion((version) => version + 1);
      // Every slot holds an item by here: the selected items refill the ones the still-selected items left empty.
      return next as TagSelectItem[];
    });
  }, [selectedItems]);
  const filtered = React.useMemo(
    () => items.filter((item) => !keys.has(item.id) && contains(resolveLabel(item), query)),
    [contains, items, keys, query, resolveLabel],
  );
  const update = React.useCallback((next: Set<Key>) => { if (!controlled) setInternal(next); onSelectionChange?.(next); }, [controlled, onSelectionChange]);
  const handleSelectionChange = (key: Key | null) => {
    if (key === null || key === undefined) return;
    update(new Set([...keys, key]));
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const handleRemove = (key: Key) => update(new Set([...keys].filter((selectedKey) => selectedKey !== key)));
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && groupRef.current) setPopoverWidth(`${groupRef.current.getBoundingClientRect().width}px`);
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const atStart = event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
    if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && atStart && !query && selectedItems.length > 0) {
      event.preventDefault();
      tagButtonRefs.current[selectedItems.length - 1]?.focus();
    }
  };
  const handleTagKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: Key, index: number) => {
    if (event.key === 'Tab') return;
    event.preventDefault();
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Backspace') {
      handleRemove(key);
      if (index === 0) inputRef.current?.focus();
      else tagButtonRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      tagButtonRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight') {
      if (index < selectedItems.length - 1) tagButtonRefs.current[index + 1]?.focus();
      else inputRef.current?.focus();
    }
  };
  const removeDisplayed = (key: Key, exiting = false) => {
    if (exiting) {
      if (selectedIdsRef.current.has(key)) return;
      setDisplayedItems((current) => current.filter((item) => item.id !== key));
      setLayoutVersion((version) => version + 1);
      return;
    }
    handleRemove(key);
  };
  const tagNodes = displayedItems.map((item) => h(AnimatedTagChip, {
    key: String(item.id),
    item,
    index: selectedItems.findIndex((selectedItem) => selectedItem.id === item.id),
    active: selectedIdsRef.current.has(item.id),
    size: resolvedSize,
    disabled,
    label: resolveLabel(item),
    tagButtonRefs,
    onRemove: removeDisplayed,
    onKeyDown: handleTagKeyDown,
    triggerRef: groupRef,
    layoutKey: layoutVersion,
  }));
  const groupClass = cx('muxui-tag-select__group', `muxui-tag-select__group--${resolvedSize}`, invalid && 'muxui-tag-select__group--invalid');
  const field = h(AriaComboBox, { inputValue: query, onInputChange: setQuery, onSelectionChange: handleSelectionChange, isDisabled: disabled, 'aria-labelledby': label ? labelId : undefined, 'aria-label': label ? undefined : 'Tags', ...{ 'aria-required': required ? required : undefined, 'aria-invalid': invalid ? invalid : undefined }, allowsEmptyCollection: true, menuTrigger: 'focus', onOpenChange: handleOpenChange, className: 'muxui-tag-select__combobox' }, h(AriaGroup, { ref: groupRef, isDisabled: disabled, isInvalid: invalid, className: groupClass }, tagNodes, h(AriaInput, { ref: inputRef, placeholder: selectedItems.length === 0 ? placeholder : '', className: 'muxui-tag-select__input', onKeyDown: handleInputKeyDown })), h(PopoverMotion, { placement: 'bottom start', offset: 4, containerPadding: 0, style: { width: popoverWidth || undefined }, className: 'muxui-tag-select__popup', ...{ 'data-muxui-size': resolvedSize } }, h(AriaListBox<TagSelectItem>, { items: filtered, className: 'muxui-tag-select__listbox', ...{ 'data-muxui-size': resolvedSize }, children: CHILDREN_FOLLOW }, renderItem as ReactNode)));
  return h(TagSelectContext.Provider, { value: { size: resolvedSize } }, h('div', { ...props, ref, className: cx('muxui-tag-select', className), 'data-muxui-size': resolvedSize, 'data-muxui-state-disabled': dataState(disabled), 'data-muxui-state-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-tag-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), field, invalid && errorMessage ? h('span', { className: 'muxui-tag-select__error' }, errorMessage) : description ? h('span', { className: 'muxui-tag-select__description' }, description) : null));
}) as TagSelectRootComponent;

export const TagSelect: {
  Root: TagSelectRootComponent;
  Item: ForwardRefExoticComponent<TagSelectItemProps & RefAttributes<HTMLDivElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: TagSelectRoot,
  Item: TagSelectItemPart,
});
