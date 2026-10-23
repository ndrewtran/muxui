import React from 'react';
import {
  ComboBox as AriaComboBox,
  Group as AriaGroup,
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  useFilter,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { PopoverMotion } from '../popover-motion.mjs';
import { useMotionLayout, useMotionLifecycle } from '../motion-components.mjs';
import { IconButton } from './icon-button.ts';
import { h, cx, dataState } from './part-utils.mjs';
import { defaultItemLabel, useItemRenderer } from './item-renderer.mjs';

/* TagSelect */
const TagSelectContext = React.createContext({ size: 'md' });
const EMPTY_TAG_ITEMS = Object.freeze([]);

function sameTagItems(first, second) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

function AnimatedTagChip({ item, index, active, size, disabled, label, tagButtonRefs, onRemove, onKeyDown, triggerRef, layoutKey }) {
  const nodeRef = React.useRef(null);
  const lifecycleRef = useMotionLifecycle({
    isOpen: active,
    placement: 'bottom',
    triggerRef,
    onExitComplete: () => onRemove(item.id, true),
  });
  useMotionLayout(nodeRef, layoutKey, triggerRef);
  const setRef = React.useCallback((node) => {
    nodeRef.current = node;
    lifecycleRef(node);
  }, [lifecycleRef]);
  return h('span', {
    ref: setRef,
    className: `muxui-tag-select__tag muxui-tag-select__tag--${size}`,
    'aria-hidden': active ? undefined : 'true',
    inert: active ? undefined : true,
  }, h('span', { className: 'muxui-tag-select__tag-text' }, label), h(IconButton, {
    ref: (element) => { if (index >= 0) tagButtonRefs.current[index] = element; },
    slot: null,
    type: 'button',
    tabIndex: -1,
    className: 'muxui-tag-select__tag-remove',
    disabled: disabled || !active,
    'aria-label': `Remove ${label}`,
    onActivate: () => onRemove(item.id),
    onKeyDown: (event) => onKeyDown(event, item.id, index),
  }, h(XIcon, { size: 14, 'aria-hidden': true, focusable: 'false' })));
}

export const TagSelect = /*#__PURE__*/ (() => ({
  Root: React.forwardRef(function TagSelectRoot({ size = 'md', label, placeholder, description, errorMessage, disabled = false, required = false, invalid = false, items = EMPTY_TAG_ITEMS, children, selectedKeys: controlledKeys, defaultSelectedKeys, onSelectionChange, getItemLabel = defaultItemLabel, className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'TagSelect');
    const controlled = controlledKeys !== undefined;
    const [internal, setInternal] = React.useState(() => new Set(defaultSelectedKeys ?? []));
    const keys = controlled ? controlledKeys : internal;
    const [query, setQuery] = React.useState('');
    const [popoverWidth, setPopoverWidth] = React.useState('');
    const groupRef = React.useRef(null);
    const inputRef = React.useRef(null);
    const tagButtonRefs = React.useRef([]);
    const labelId = React.useId();
    const { contains } = useFilter({ sensitivity: 'base' });
    const resolveLabel = React.useCallback((item) => getItemLabel(item), [getItemLabel]);
    const renderItem = useItemRenderer(children, TagSelect.Item, resolveLabel);
    const itemsById = React.useMemo(() => {
      const map = new Map();
      for (const item of items) map.set(item.id, item);
      return map;
    }, [items]);
    const selectedItems = React.useMemo(
      () => [...keys].map((key) => itemsById.get(key)).filter((item) => item !== undefined),
      [itemsById, keys],
    );
    const selectedIdsRef = React.useRef(new Set());
    selectedIdsRef.current = new Set(selectedItems.map((item) => item.id));
    const [displayedItems, setDisplayedItems] = React.useState(() => selectedItems);
    const [layoutVersion, setLayoutVersion] = React.useState(0);
    React.useEffect(() => {
      const selectedIds = new Set(selectedItems.map((item) => item.id));
      setDisplayedItems((current) => {
        const next = Array(current.length).fill(null);
        current.forEach((item, index) => {
          if (!selectedIds.has(item.id)) next[index] = item;
        });
        const remaining = [...selectedItems];
        for (let index = 0; index < next.length && remaining.length > 0; index += 1) {
          if (next[index] === null) next[index] = remaining.shift();
        }
        next.push(...remaining);
        if (sameTagItems(current, next)) return current;
        setLayoutVersion((version) => version + 1);
        return next;
      });
    }, [selectedItems]);
    const filtered = React.useMemo(
      () => items.filter((item) => !keys.has(item.id) && contains(resolveLabel(item), query)),
      [contains, items, keys, query, resolveLabel],
    );
    const update = React.useCallback((next) => { if (!controlled) setInternal(next); onSelectionChange?.(next); }, [controlled, onSelectionChange]);
    const handleSelectionChange = (key) => {
      if (key === null || key === undefined) return;
      update(new Set([...keys, key]));
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const handleRemove = (key) => update(new Set([...keys].filter((selectedKey) => selectedKey !== key)));
    const handleOpenChange = (isOpen) => {
      if (isOpen && groupRef.current) setPopoverWidth(`${groupRef.current.getBoundingClientRect().width}px`);
    };
    const handleInputKeyDown = (event) => {
      const atStart = event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
      if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && atStart && !query && selectedItems.length > 0) {
        event.preventDefault();
        tagButtonRefs.current[selectedItems.length - 1]?.focus();
      }
    };
    const handleTagKeyDown = (event, key, index) => {
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
    const removeDisplayed = (key, exiting = false) => {
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
    const field = h(AriaComboBox, { inputValue: query, onInputChange: setQuery, onSelectionChange: handleSelectionChange, isDisabled: disabled, 'aria-labelledby': label ? labelId : undefined, 'aria-label': label ? undefined : 'Tags', 'aria-required': required || undefined, 'aria-invalid': invalid || undefined, allowsEmptyCollection: true, menuTrigger: 'focus', onOpenChange: handleOpenChange, className: 'muxui-tag-select__combobox' }, h(AriaGroup, { ref: groupRef, isDisabled: disabled, isInvalid: invalid, className: groupClass }, tagNodes, h(AriaInput, { ref: inputRef, placeholder: selectedItems.length === 0 ? placeholder : '', className: 'muxui-tag-select__input', onKeyDown: handleInputKeyDown })), h(PopoverMotion, { placement: 'bottom start', offset: 4, containerPadding: 0, style: { width: popoverWidth || undefined }, className: 'muxui-tag-select__popup', 'data-size': resolvedSize }, h(AriaListBox, { items: filtered, className: 'muxui-tag-select__listbox', 'data-size': resolvedSize }, renderItem)));
    return h(TagSelectContext.Provider, { value: { size: resolvedSize } }, h('div', { ...props, ref, className: cx('muxui-tag-select', className), 'data-size': resolvedSize, 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-tag-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), field, invalid && errorMessage ? h('span', { className: 'muxui-tag-select__error' }, errorMessage) : description ? h('span', { className: 'muxui-tag-select__description' }, description) : null));
  }),
  Item: React.forwardRef(function TagSelectItem({ disabled = false, className, ...props }, ref) { return h(AriaListBoxItem, { ...props, ref, isDisabled: disabled, className: cx('muxui-tag-select__item', className) }); }),
}))();
