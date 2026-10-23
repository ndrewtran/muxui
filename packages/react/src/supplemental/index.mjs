import React from 'react';
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  Collection as AriaCollection,
  ComboBox as AriaComboBox,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  FieldInputContext as AriaFieldInputContext,
  Focusable as AriaFocusable,
  Group as AriaGroup,
  Header as AriaHeader,
  Heading as AriaHeading,
  Input as AriaInput,
  InputContext as AriaInputContext,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Link as AriaLink,
  MenuTrigger as AriaMenuTrigger,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  SearchField as AriaSearchField,
  Text as AriaText,
  useFilter,
  useLocale,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import ChevronsUpDownIcon from 'lucide-react/dist/esm/icons/chevrons-up-down.mjs';
import PanelLeftIcon from 'lucide-react/dist/esm/icons/panel-left.mjs';
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { Menu } from '../collections.mjs';
import { Tooltip } from '../overlays.ts';
import { PopoverMotion } from '../popover-motion.mjs';
import { useMotionLayout, useMotionLifecycle } from '../motion-components.mjs';
import { Button as MuxUIButton } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { h, useIsomorphicLayoutEffect, cx, dataState, nativePart, pressHandler } from './part-utils.mjs';
import { MotionModalBackdropForwardRef, MotionModalPopupForwardRef } from './modal-parts.mjs';
import { defaultItemLabel, useItemRenderer } from './item-renderer.mjs';
import { sidebarUnreachable, sidebarFocusFirst, sidebarHandoff, SidebarDrawerExit } from './navigation-drawer.mjs';

function normalizeKeys(value) {
  if (value === 'all') return 'all';
  return value instanceof Set ? value : new Set(value ?? []);
}

function AlertDialogRoot({ open, defaultOpen = false, onOpenChange, children, ...props }) {
  return h(AriaDialogTrigger, {
    ...props,
    isOpen: open,
    defaultOpen,
    onOpenChange,
  }, children);
}

const AlertDialogDescription = React.forwardRef(function AlertDialogDescription({ className, ...props }, ref) {
  return h(AriaText, { ...props, ref, slot: 'description', elementType: 'p', className: cx('muxui-alert-dialog__description', className) });
});

function findAlertDialogDescriptionId(children) {
  let descriptionId;
  React.Children.forEach(children, (child) => {
    if (descriptionId || !React.isValidElement(child)) return;
    if (child.type === AlertDialogDescription) {
      if (typeof child.props.id === 'string' && child.props.id) descriptionId = child.props.id;
      return;
    }
    descriptionId = findAlertDialogDescriptionId(child.props.children);
  });
  return descriptionId;
}

const AlertDialog = /*#__PURE__*/ (() => ({
  Root: React.forwardRef(function AlertDialogRootRef(props, ref) {
    return h(AlertDialogRoot, { ...props, ref });
  }),
  Backdrop: React.forwardRef(function AlertDialogBackdrop({ className, ...props }, ref) {
    return h(MotionModalBackdropForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__backdrop', className) });
  }),
  Popup: React.forwardRef(function AlertDialogPopup({ className, ...props }, ref) {
    return h(MotionModalPopupForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__popup', className) });
  }),
  Content: React.forwardRef(function AlertDialogContent({ className, children, 'aria-describedby': ariaDescribedby, ...props }, ref) {
    // Keep RAC's description slot lifecycle, then add caller-owned context IDs.
    return h(AriaDialog, { ...props, ref, role: 'alertdialog', 'aria-describedby': findAlertDialogDescriptionId(children),
      className: cx('muxui-alert-dialog__content', className),
      render: (dialogProps) => h('section', { ...dialogProps,
        'aria-describedby': [...new Set([ariaDescribedby, dialogProps['aria-describedby']].filter(Boolean).join(' ').split(/\s+/u))].filter(Boolean).join(' ') || undefined,
      }),
    }, children);
  }),
  Title: React.forwardRef(function AlertDialogTitle({ className, ...props }, ref) {
    return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-alert-dialog__title', className) });
  }),
  Description: AlertDialogDescription,
  Trigger: React.forwardRef(function AlertDialogTrigger({ disabled = false, onActivate, className, ...props }, ref) {
    return h(AriaButton, { ...props, ref, isDisabled: disabled, onPress: pressHandler(onActivate), className: cx('muxui-alert-dialog__trigger', className) });
  }),
  Actions: React.forwardRef(function AlertDialogActions({ className, ...props }, ref) {
    return nativePart('div', 'muxui-alert-dialog__actions', props, ref);
  }),
  Close: React.forwardRef(function AlertDialogClose({ disabled, onActivate, className, children, ...props }, ref) {
    const usesDefaultIcon = children === null || children === undefined;
    const buttonProps = {
      ...props,
      ref,
      slot: 'close',
      disabled,
      size: usesDefaultIcon ? 'sm' : 'md',
      variant: usesDefaultIcon ? 'ghost' : 'neutral',
      onActivate,
      className: cx('muxui-alert-dialog__close', className),
    };
    return usesDefaultIcon
      ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Close' }, h(XIcon, { size: 16, 'aria-hidden': true, focusable: 'false' }))
      : h(MuxUIButton, buttonProps, children);
  }),
}))();

// MultiSelect has no label prop, so plain text content doubles as search text.
const multiSelectTextValue = (item, rendered) => (
  typeof rendered === 'string' || typeof rendered === 'number' ? String(rendered) : defaultItemLabel(item)
);

// The all selection stands for every item that is not disabled. The ListBox collection that
// knows them exists only while the popup is open, so count them from the items and children.
function countEnabledItems(children, items, renderItem) {
  if (typeof children === 'function') return (items ?? []).filter((item) => !renderItem(item).props.disabled).length;
  let count = 0;
  const visit = (nodes) => React.Children.forEach(nodes, (node) => {
    if (!React.isValidElement(node)) return;
    if (node.type === React.Fragment) visit(node.props.children);
    else if (!node.props.disabled) count += 1;
  });
  visit(children);
  return count;
}

/* MultiSelect */
const MultiSelectContext = React.createContext({ size: 'md', close: () => {} });
export const MultiSelect = /*#__PURE__*/ (() => ({
  Root: React.forwardRef(function MultiSelectRoot({ size = 'md', label, placeholder = 'Select', description, errorMessage, disabled = false, required = false, invalid = false, items, children, selectedKeys, defaultSelectedKeys, onSelectionChange, showSearch = true, showFooter = true, onReset, onSelectAll, selectedCountFormatter, supportingText, emptyStateTitle = 'No results found', emptyStateDescription = 'Please try a different search term.', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'MultiSelect');
    const [query, setQuery] = React.useState('');
    const [popoverWidth, setPopoverWidth] = React.useState('');
    const triggerRef = React.useRef(null);
    const instanceId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '');
    const labelId = label ? `muxui-multi-select-label-${instanceId}` : undefined;
    // aria-required is unsupported on a button and aria-invalid is deprecated there (WAI-ARIA 1.2),
    // and React Aria's Button filters both out. Like React Aria's own fields, state is described
    // instead: a hidden status span plus the visible description or error, linked by aria-describedby.
    const statusId = `muxui-multi-select-status-${instanceId}`;
    const descriptionId = `muxui-multi-select-description-${instanceId}`;
    const errorId = `muxui-multi-select-error-${instanceId}`;
    const showDescription = Boolean(description) && !invalid;
    const showError = invalid && Boolean(errorMessage);
    const status = [required && 'Required', invalid && 'Invalid'].filter(Boolean).join(', ');
    const describedBy = [status && statusId, showDescription && descriptionId, showError && errorId].filter(Boolean).join(' ') || undefined;
    const { contains } = useFilter({ sensitivity: 'base' });
    const controlled = selectedKeys !== undefined;
    const [internalSelected, setInternalSelected] = React.useState(() => normalizeKeys(defaultSelectedKeys));
    const selected = controlled ? normalizeKeys(selectedKeys) : internalSelected;
    const allItems = React.useMemo(() => (items ? Array.from(items) : undefined), [items]);
    const renderItem = useItemRenderer(children, MultiSelect.Item, multiSelectTextValue);
    const updateSelection = (next) => {
      if (!controlled) setInternalSelected(normalizeKeys(next));
      onSelectionChange?.(next);
    };
    const selectsAll = selected === 'all';
    const enabledCount = React.useMemo(() => (selectsAll ? countEnabledItems(children, allItems, renderItem) : 0), [selectsAll, children, allItems, renderItem]);
    const selectedCount = selectsAll ? enabledCount : selected.size;
    const [open, setOpen] = React.useState(false);
    const clearSearch = () => setQuery('');
    const search = showSearch && h('div', { className: 'muxui-multi-select__search-wrapper' }, h(AriaSearchField, { 'aria-label': 'Search', value: query, onChange: setQuery, autoFocus: true, className: 'muxui-multi-select__search' }, h(SearchIcon, { className: 'muxui-multi-select__search-icon', size: 16, 'aria-hidden': true, focusable: 'false' }), h(AriaInput, { placeholder: 'Search', className: 'muxui-multi-select__search-input' })));
    const empty = h('div', { className: 'muxui-multi-select__empty' }, h('p', { className: 'muxui-multi-select__empty-title' }, emptyStateTitle), h('p', { className: 'muxui-multi-select__empty-description' }, emptyStateDescription), query && h('button', { type: 'button', className: 'muxui-multi-select__empty-clear', onClick: clearSearch }, 'Clear search'));
    // Reset and Select all change the selection like a click on an item; the callbacks only notify.
    const reset = () => { updateSelection(new Set()); onReset?.(); };
    const selectAll = () => { updateSelection('all'); onSelectAll?.(); };
    const footer = showFooter && h('div', { className: 'muxui-multi-select__footer' }, h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: reset }, 'Reset'), h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: selectAll }, 'Select all'));
    const popup = h(PopoverMotion, { placement: 'bottom', offset: 4, containerPadding: 0, className: cx('muxui-multi-select__popup', resolvedSize !== 'md' && `muxui-multi-select__popup--${resolvedSize}`), 'data-size': resolvedSize, style: { width: popoverWidth || undefined } }, h(AriaDialog, { className: 'muxui-multi-select__dialog' }, h(AriaAutocomplete, { filter: contains, inputValue: query, onInputChange: setQuery }, search, h(AriaListBox, { items: allItems, selectionMode: 'multiple', selectedKeys: selected, onSelectionChange: updateSelection, escapeKeyBehavior: 'none', 'aria-label': typeof label === 'string' ? label : 'Options', renderEmptyState: () => empty, className: cx('muxui-multi-select__listbox', resolvedSize !== 'md' && `muxui-multi-select__listbox--${resolvedSize}`), 'data-size': resolvedSize }, renderItem)), footer));
    const trigger = h(AriaButton, { ref: triggerRef, isDisabled: disabled, onClick: () => setPopoverWidth(`${triggerRef.current?.getBoundingClientRect().width ?? 0}px`), className: cx('muxui-multi-select__trigger', invalid && 'muxui-multi-select__trigger--invalid'), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? (ariaLabel === undefined && labelId ? labelId : undefined), 'aria-describedby': describedBy }, h('span', { className: cx('muxui-multi-select__trigger-inner', `muxui-multi-select__trigger-inner--${resolvedSize}`) }, h('span', { className: cx('muxui-multi-select__value', selectedCount ? 'muxui-multi-select__value--selected' : 'muxui-multi-select__value--placeholder') }, selectedCount ? h(React.Fragment, null, selectedCountFormatter?.(selectedCount) ?? `${selectedCount} selected`, supportingText && h('span', { className: 'muxui-multi-select__supporting-text' }, supportingText)) : placeholder), h('span', { className: 'muxui-multi-select__icon', 'aria-hidden': true }, h(ChevronDownIcon, { size: 16, focusable: 'false' }))));
    const select = h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen }, trigger, popup);
    return h(MultiSelectContext.Provider, { value: { size: resolvedSize, close: () => setOpen(false) } }, h('div', { ...props, ref, className: cx('muxui-multi-select', `muxui-multi-select--${resolvedSize}`, className), 'data-size': resolvedSize, 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-multi-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), select, status && h('span', { id: statusId, hidden: true }, status), showDescription && h('span', { id: descriptionId, className: 'muxui-multi-select__description' }, description), showError && h('span', { id: errorId, className: 'muxui-multi-select__error' }, errorMessage)));
  }),
  Item: React.forwardRef(function MultiSelectItem({ disabled = false, className, children, ...props }, ref) { return h(AriaListBoxItem, { ...props, ref, isDisabled: disabled, className: cx('muxui-multi-select__item', className) }, (renderProps) => h(React.Fragment, null, h('span', { className: 'muxui-multi-select__item-check', 'aria-hidden': true }, renderProps.isSelected && h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' }, h('path', { d: 'M2 6L5 9L10 3', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }))), h('span', { className: 'muxui-multi-select__item-text' }, typeof children === 'function' ? children(renderProps) : children))); }),
}))();

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

/* CommandPalette */
export function useCommandPalette({ commands, query: controlledQuery, defaultQuery = '', onQueryChange, filter, sort, groupBy, getGroupTitle, onAction, onError, close, closeOnSelect = true }) {
  const [internalQuery, setInternalQuery] = React.useState(defaultQuery);
  const query = controlledQuery ?? internalQuery;
  const { contains, startsWith } = useFilter({ sensitivity: 'base' });
  const { locale } = useLocale();
  const collator = React.useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' }), [locale]);
  const setQuery = React.useCallback((next) => {
    if (controlledQuery === undefined) setInternalQuery(next);
    onQueryChange?.(next);
  }, [controlledQuery, onQueryChange]);
  const filteredCommands = React.useMemo(() => {
    const search = query.trim();
    const results = commands.filter((command) => {
      if (filter === false) return true;
      if (filter) return filter(command, query);
      const text = [command.title, command.subtitle, command.group, ...(command.keywords ?? [])].filter(Boolean).join(' ');
      return !search || contains(text, search);
    });
    if (sort === false) return results;
    const rank = (command) => {
      if (!search) return 0;
      const title = command.title.trim();
      if (collator.compare(title, search) === 0) return 3;
      if (startsWith(title, search)) return 2;
      return contains(title, search) ? 1 : 0;
    };
    // Sorting the new array preserves source order for ties without mutating commands.
    return results.sort(sort ? (a, b) => sort(a, b, query) : (a, b) => rank(b) - rank(a));
  }, [commands, query, filter, sort, contains, startsWith, collator]);
  const groupedCommands = React.useMemo(() => {
    const groups = new Map();
    for (const command of filteredCommands) {
      const id = (groupBy ? groupBy(command) : command.group) ?? '';
      if (!groups.has(id)) groups.set(id, { id, title: getGroupTitle ? getGroupTitle(id) : id, commands: [] });
      groups.get(id).commands.push(command);
    }
    return [...groups.values()];
  }, [filteredCommands, groupBy, getGroupTitle]);
  const runCommand = React.useCallback(async (commandOrId) => {
    const command = typeof commandOrId === 'string' ? commands.find(({ id }) => id === commandOrId) : commandOrId;
    if (!command || command.disabled) return;
    await command.action?.();
    await onAction?.(command);
    if (command.closeOnSelect ?? closeOnSelect) close?.();
  }, [commands, onAction, close, closeOnSelect]);
  const getItemProps = React.useCallback((command) => ({
    id: command.id, title: command.title, description: command.subtitle, textValue: command.title,
    href: command.href, target: command.target, disabled: command.disabled,
    // The hook dismisses only after successful asynchronous actions.
    closeOnSelect: false,
    onActivate: () => runCommand(command).catch((error) => {
      if (onError) onError(error, command);
      else if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
      else console.error(error);
    }),
  }), [runCommand, onError]);
  return { query, setQuery, filteredCommands, groupedCommands, runCommand, getItemProps };
}

const CommandPaletteContext = React.createContext(null);
const COMMAND_PALETTE_SIZES = new Set(['sm', 'md', 'lg']);
function normalizeCommandPaletteSize(size) {
  const resolved = size ?? 'md';
  if (!COMMAND_PALETTE_SIZES.has(resolved)) {
    throw new TypeError(`CommandPalette size must be one of: ${[...COMMAND_PALETTE_SIZES].join(', ')}`);
  }
  return resolved;
}
function useCommandPart(part) { const context = React.useContext(CommandPaletteContext); if (!context) throw new Error(`CommandPalette.${part} must be used inside CommandPalette.Root`); return context; }
function CommandPaletteInputProvider({ children }) {
  // Autocomplete supplies field-level callbacks. Bridge them to a native Input
  // without adding a wrapper or taking ownership of its value/defaultValue.
  const { value: _value, onChange, ...inputProps } = React.useContext(AriaFieldInputContext);
  return h(AriaInputContext.Provider, {
    value: { ...inputProps, onChange: (event) => onChange?.(event.currentTarget.value) },
  }, children);
}
const CommandPalette = /*#__PURE__*/ (() => ({
  Root: React.forwardRef(function CommandPaletteRoot({ open, defaultOpen = false, onOpenChange, size = 'md', closeOnSelect = true, className, children, ...props }, ref) {
    const resolvedSize = normalizeCommandPaletteSize(size);
    const controlled = open !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const triggerRef = React.useRef(null);
    const currentOpen = controlled ? open : internalOpen;
    const setOpen = (next) => { if (!controlled) setInternalOpen(next); onOpenChange?.(next); };
    return h(CommandPaletteContext.Provider, { value: { open: currentOpen, setOpen, size: resolvedSize, closeOnSelect, triggerRef } }, h('div', { ...props, ref, className: cx('muxui-command-palette', resolvedSize !== 'md' && `muxui-command-palette--${resolvedSize}`, className), 'data-size': resolvedSize, 'data-open': dataState(currentOpen) }, children));
  }),
  Trigger: React.forwardRef(function CommandPaletteTrigger({ disabled = false, onActivate, className, ...props }, ref) { const { setOpen, size, triggerRef } = useCommandPart('Trigger'); const setRef = React.useCallback((node) => { triggerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }, [ref, triggerRef]); return h(AriaButton, { ...props, ref: setRef, isDisabled: disabled, onPress: (event) => { pressHandler(onActivate)?.(event); setOpen(true); }, 'data-size': size, className: cx('muxui-command-palette__trigger', className) }); }),
  Backdrop: React.forwardRef(function CommandPaletteBackdrop({ dismissable = true, className, ...props }, ref) { const { open, setOpen, triggerRef } = useCommandPart('Backdrop'); return h(MotionModalBackdropForwardRef, { ...props, ref, triggerRef, isOpen: open, onOpenChange: setOpen, isDismissable: dismissable, className: cx('muxui-command-palette__backdrop', className) }); }),
  Popup: React.forwardRef(function CommandPalettePopup({ className, children, ...props }, ref) { return h(MotionModalPopupForwardRef, { className: 'muxui-command-palette__popup' }, h(AriaDialog, { ...props, ref, className: cx('muxui-command-palette__dialog', className) }, children)); }),
  Title: React.forwardRef(function CommandPaletteTitle({ className, ...props }, ref) { return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-command-palette__title', className) }); }),
  Description: React.forwardRef(function CommandPaletteDescription(props, ref) { return nativePart('p', 'muxui-command-palette__description', props, ref); }),
  Close: React.forwardRef(function CommandPaletteClose({ disabled = false, onActivate, className, children, ...props }, ref) {
    const { setOpen } = useCommandPart('Close');
    const handleActivate = (event) => { pressHandler(onActivate)?.(event); setOpen(false); };
    const buttonProps = { ...props, ref, disabled, size: 'sm', variant: 'ghost', onActivate: handleActivate, className: cx('muxui-command-palette__close', className) };
    return children === null || children === undefined
      ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Close' }, h(XIcon, { size: 16, 'aria-hidden': true, focusable: 'false' }))
      : h(MuxUIButton, buttonProps, children);
  }),
  Content: React.forwardRef(function CommandPaletteContent({ className, children, ...props }, ref) { return h('div', { ...props, ref, className: cx('muxui-command-palette__content', className) }, h(AriaAutocomplete, null, h(CommandPaletteInputProvider, null, children))); }),
  SearchField: React.forwardRef(function CommandPaletteSearchField({ variant = 'inline', className, ...props }, ref) { return h(AriaSearchField, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Search commands', className: cx('muxui-command-palette__search-field', `muxui-command-palette__search-field--${variant}`, className) }); }),
  Input: React.forwardRef(function CommandPaletteInput({ disabled, className, onKeyDown, ...props }, ref) {
    const { size } = useCommandPart('Input');
    const { onKeyDown: navigate, ...inputContext } = React.useContext(AriaInputContext);
    return h(AriaInputContext.Provider, { value: inputContext }, h(AriaInput, {
      ...props, ref, disabled, autoFocus: props.autoFocus ?? true, 'data-size': size,
      className: cx('muxui-command-palette__input', className),
      onKeyDown(event) {
        onKeyDown?.(event);
        if (!event.defaultPrevented) navigate?.(event);
      },
    }));
  }),
  ClearButton: React.forwardRef(function CommandPaletteClearButton({ disabled = false, className, children, ...props }, ref) { return h(AriaButton, { ...props, ref, isDisabled: disabled, 'data-variant': 'ghost', 'data-size': 'sm', className: cx('muxui-button', 'muxui-command-palette__clear', className) }, children ?? 'Clear'); }),
  ListBox: React.forwardRef(function CommandPaletteListBox({ className, ...props }, ref) { const { size } = useCommandPart('ListBox'); return h(AriaListBox, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Command results', 'data-size': size, className: cx('muxui-command-palette__listbox', size !== 'md' && `muxui-command-palette__listbox--${size}`, className) }); }),
  Section: React.forwardRef(function CommandPaletteSection({ className, ...props }, ref) { return h(AriaListBoxSection, { ...props, ref, className: cx('muxui-command-palette__section', className) }); }),
  SectionHeader: React.forwardRef(function CommandPaletteSectionHeader(props, ref) { return h(AriaHeader, { ...props, ref, className: cx('muxui-command-palette__section-header', props.className) }); }),
  Item: React.forwardRef(function CommandPaletteItem({ id, title, description, href, disabled = false, closeOnSelect, onActivate, className, children, ...props }, ref) { const { setOpen, closeOnSelect: defaultClose } = useCommandPart('Item'); const shouldClose = closeOnSelect ?? defaultClose; return h(AriaListBoxItem, { ...props, ref, id, textValue: title ?? props.textValue, href, isDisabled: disabled, onAction: () => { onActivate?.({ id }); if (shouldClose) setOpen(false); }, className: cx('muxui-command-palette__item', className) }, children ?? h(React.Fragment, null, title && h('span', { className: 'muxui-command-palette__item-title' }, title), description && h('span', { className: 'muxui-command-palette__item-description' }, description))); }),
  Separator: React.forwardRef(function CommandPaletteSeparator(props, ref) { return nativePart('hr', 'muxui-command-palette__separator', props, ref); }),
  Collection: AriaCollection,
  ItemIcon: React.forwardRef(function CommandPaletteItemIcon(props, ref) { return nativePart('span', 'muxui-command-palette__item-icon', props, ref); }),
  ItemContent: React.forwardRef(function CommandPaletteItemContent(props, ref) { return nativePart('div', 'muxui-command-palette__item-content', props, ref); }),
  ItemTitle: React.forwardRef(function CommandPaletteItemTitle(props, ref) { return nativePart('span', 'muxui-command-palette__item-title', props, ref); }),
  ItemDescription: React.forwardRef(function CommandPaletteItemDescription(props, ref) { return nativePart('span', 'muxui-command-palette__item-description', props, ref); }),
  ItemMeta: React.forwardRef(function CommandPaletteItemMeta(props, ref) { return nativePart('span', 'muxui-command-palette__item-meta', props, ref); }),
  Shortcut: React.forwardRef(function CommandPaletteShortcut({ keys, children, 'aria-hidden': ariaHidden = true, ...props }, ref) { return nativePart('span', 'muxui-command-palette__shortcut', { ...props, 'aria-hidden': ariaHidden }, ref, keys ? keys.map((key) => h('kbd', { key, className: 'muxui-command-palette__shortcut-key' }, key)) : children); }),
  LoadMoreItem: React.forwardRef(function CommandPaletteLoadMoreItem(props, ref) { return nativePart('div', 'muxui-command-palette__load-more-item', { ...props, role: 'presentation' }, ref); }),
  Empty: React.forwardRef(function CommandPaletteEmpty(props, ref) { return nativePart('div', 'muxui-command-palette__empty', props, ref); }),
  Footer: React.forwardRef(function CommandPaletteFooter(props, ref) { return nativePart('div', 'muxui-command-palette__footer', props, ref); }),
  Chips: React.forwardRef(function CommandPaletteChips(props, ref) { return nativePart('div', 'muxui-command-palette__chips', props, ref); }),
  Chip: React.forwardRef(function CommandPaletteChip(props, ref) { return nativePart('span', 'muxui-command-palette__chip', props, ref); }),
  ChipRemove: React.forwardRef(function CommandPaletteChipRemove({ disabled = false, children, ...props }, ref) {
    const buttonProps = { ...props, ref, type: 'button', disabled, className: cx('muxui-command-palette__chip-remove', props.className) };
    return children === null || children === undefined
      ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Remove chip' }, h(XIcon, { size: 14, 'aria-hidden': true, focusable: 'false' }))
      : h('button', buttonProps, children);
  }),
}))();

/* Header navigation */
const HeaderNav = {
  Root: React.forwardRef(function HeaderNavRoot(props, ref) { return nativePart('header', 'muxui-header-nav', props, ref); }),
  Logo: React.forwardRef(function HeaderNavLogo({ href, children, className, ...props }, ref) { return nativePart('div', 'muxui-header-nav__logo', { ...props, className }, ref, href ? h('a', { href, className: 'muxui-header-nav__logo-link' }, children) : children); }),
  NavButton: React.forwardRef(function HeaderNavButton({ href, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, className: cx('muxui-header-nav__nav-btn', current && 'muxui-header-nav__nav-btn--current', className), 'aria-current': current ? 'page' : undefined }); }),
  Actions: React.forwardRef(function HeaderNavActions(props, ref) { return nativePart('div', 'muxui-header-nav__actions', props, ref); }),
  Secondary: React.forwardRef(function HeaderNavSecondary(props, ref) { return nativePart('nav', 'muxui-header-nav__secondary', props, ref); }),
  MobileTrigger: function HeaderNavMobileTrigger({ children }) {
    const [open, setOpen] = React.useState(false);
    const latest = React.useRef(open);
    latest.current = open;
    const button = React.useRef(null);
    // The drawer's focused link and dialog when layout took it away, for the header link that should receive focus next.
    const handoff = React.useRef(null);
    // When layout hides the trigger (the header's own links took over), an open drawer would be stranded and Escape
    // would leave focus on the body: close it and hand focus to the header.
    React.useEffect(() => {
      const trigger = button.current;
      if (!trigger || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => {
        if (!latest.current || trigger.getClientRects().length > 0) return;
        const dialog = document.activeElement?.closest('.muxui-header-nav__mobile-dialog') ?? null;
        handoff.current = { dialog, href: dialog ? document.activeElement.closest('a[href]')?.getAttribute('href') ?? null : null, root: trigger.closest('.muxui-header-nav') };
        setOpen(false);
      });
      observer.observe(trigger);
      return () => observer.disconnect();
    }, []);
    // Runs after the drawer has left: the header link matching the drawer's focused link, then any visible control in the
    // header, then the header itself, which Sidebar's handoff makes focusable by script when nothing else takes focus.
    const exit = () => {
      const wanted = handoff.current;
      handoff.current = null;
      if (!wanted?.root) return;
      // Hidden copies drop out first, so the matching link is the visible one even when a hidden link shares its destination.
      const controls = () => [...wanted.root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((node) => !node.disabled && node.getAttribute('tabindex') !== '-1' && !sidebarUnreachable(node));
      sidebarHandoff(() => {
        const all = controls();
        return [all.find((node) => wanted.href !== null && node.getAttribute('href') === wanted.href), ...all, wanted.root];
      }, new Set([wanted.root]), (active) => wanted.dialog?.contains(active));
    };
    return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen }, h(IconButton, { ref: button, className: 'muxui-header-nav__mobile-trigger', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' })), h(AriaModalOverlay, { className: 'muxui-header-nav__mobile-overlay' }, h(AriaModal, { className: 'muxui-header-nav__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-header-nav__mobile-dialog' }, ({ close }) => h(React.Fragment, null, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-header-nav__mobile-close-row' }, h(IconButton, { size: 'sm', onActivate: close, className: 'muxui-header-nav__mobile-close-btn', 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children)))));
  },
};

/* Sidebar */
// Folding state lives in Sidebar.Provider so Root, Toggle, and the shortcut share it. Without a Provider every part renders as before.
const SidebarContext = React.createContext(null);
// AccountCard shares its element with AccountMenu so the menu can anchor to the card, and AccountMenu tells the card it is mounted.
const SidebarAccountContext = React.createContext(null);
function useSidebarAccount() { const account = React.useContext(SidebarAccountContext); if (!account) throw new Error('Sidebar.AccountMenu must be used inside Sidebar.AccountCard'); return account; }
function useSidebarPart(part) { const context = React.useContext(SidebarContext); if (!context) throw new Error(`Sidebar.${part} must be used inside Sidebar.Provider`); return context; }
const SIDEBAR_EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const sidebarShortcutModifier = (event) => (/mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform ?? '') ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
// Providers that own a shortcut. One pair of document listeners serves them all, so exactly one Provider handles a chord.
const sidebarShortcuts = new Set();
let sidebarMounts = 0;
function handleSidebarShortcut(event, capturing) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey || !sidebarShortcutModifier(event)) return;
  // The composed path sees through shadow roots, where the document only sees the host.
  const path = event.composedPath?.() ?? [event.target];
  // Leave the chord to text editing, where Cmd or Ctrl plus B means bold.
  if (path[0] instanceof Element && path[0].closest(SIDEBAR_EDITABLE)) return;
  const matches = [...sidebarShortcuts].filter(({ key }) => key === event.key?.toLowerCase()).sort((a, b) => a.order - b.order);
  const holder = matches.find(({ nodes }) => nodes().some((node) => path.includes(node)));
  // A Sidebar's own controls stop keydown before it bubbles (Tooltip triggers do), so their chords are taken while
  // capturing. Every other target gets to handle the chord first: it is ours in the bubble phase, if still uncancelled,
  // for the Provider that mounted last.
  const owner = capturing ? holder : holder ?? matches.at(-1);
  if (!owner) return;
  event.preventDefault();
  owner.toggle();
}
const onSidebarShortcutCapture = (event) => handleSidebarShortcut(event, true);
const onSidebarShortcutBubble = (event) => handleSidebarShortcut(event, false);

/** The column's focus candidates after its drawer is gone: the link matching the drawer's focused link, the current link, a Toggle, then Root. */
function sidebarColumnCandidates({ roots, toggles }, href) {
  const links = [...roots].flatMap((root) => [...root.querySelectorAll('a[href]')]);
  return [links.find((link) => link.getAttribute('href') === href), links.find((link) => link.getAttribute('aria-current') === 'page'), ...toggles, ...roots];
}

/** The text a NavItem label spells out, through elements and fragments. */
function sidebarLabelText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(sidebarLabelText).join('');
  return React.isValidElement(node) ? sidebarLabelText(node.props.children) : '';
}
/** Names a folded icon with a Mux Tooltip; outside a Provider it returns the trigger untouched. */
function SidebarRailTooltip({ label, children }) {
  const sidebar = React.useContext(SidebarContext);
  if (!sidebar || label === undefined || label === null || label === '') return children;
  // Native hosts join the tooltip trigger through Focusable; React Aria links already consume it.
  const trigger = typeof children.type === 'string' ? h(AriaFocusable, null, children) : children;
  return h(Tooltip, { content: label, trigger, placement: 'end', offset: 8, disabled: !sidebar.collapsed });
}
/** The visible header of the outermost nav group around `node`: where focus goes when folding hides the nested link it was on. */
function sidebarGroupHeader(node) {
  let list = node.closest('.muxui-sidebar__nav-children');
  while (list?.parentElement?.closest('.muxui-sidebar__nav-children')) list = list.parentElement.closest('.muxui-sidebar__nav-children');
  return list?.parentElement.querySelector(':scope > summary, :scope > .muxui-sidebar__nav-row > .muxui-sidebar__nav-link');
}
/** Open state of a nav group: the caller's when `expanded` is given, otherwise kept here starting from `defaultExpanded`. */
function useSidebarExpanded({ expanded, defaultExpanded = false, onExpandedChange }) {
  const controlled = expanded !== undefined;
  const [internal, setInternal] = React.useState(defaultExpanded);
  const open = controlled ? expanded : internal;
  const setOpen = (next) => { if (next === open) return; if (!controlled) setInternal(next); onExpandedChange?.(next); };
  return [open, setOpen];
}
/**
 * One nav entry at any depth, as a link, a disclosure group, or a link group. Without `href`, items form a native
 * details group; with `href`, the link and a separate toggle button share a row, since a summary cannot hold a link.
 * `child` entries are the rows nested under a top-level NavItem: label only, no icon, mark, badge, or rail tooltip.
 */
function SidebarNavNode({ label, href, icon: Icon, badge, current = false, external = false, items, child = false, expanded, defaultExpanded, onExpandedChange }) {
  const sidebar = React.useContext(SidebarContext);
  const [open, setOpen] = useSidebarExpanded({ expanded, defaultExpanded, onExpandedChange });
  const detailsRef = React.useRef(null);
  const listRef = React.useRef(null);
  // The group's visible control: the summary of a disclosure group, the toggle of a link group.
  const controlRef = React.useRef(null);
  const listId = React.useId();
  const labelId = React.useId();
  const [, rerender] = React.useReducer((count) => count + 1, 0);
  // The browser can open a details group itself (find in page); a caller that refuses the change gets its state back.
  useIsomorphicLayoutEffect(() => { if (detailsRef.current && detailsRef.current.open !== open) detailsRef.current.open = open; });
  // Closing the group, by the user or by the caller's `expanded`, hides the links inside it. Focus on one of them moves to the group's control, which stays visible.
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (open || !list || !list.contains(list.getRootNode().activeElement)) return;
    controlRef.current?.focus({ preventScroll: true });
  }, [open]);
  // Folded, an item without an icon keeps a mark in the icon column: the first character of its label, or a dot if it has no text.
  const initial = child || Icon || !sidebar ? undefined : [...sidebarLabelText(label).trim()][0]?.toUpperCase() ?? '•';
  const leading = Icon ? h(Icon, { className: 'muxui-sidebar__nav-icon', 'aria-hidden': true }) : initial && h('span', { className: 'muxui-sidebar__nav-mark', 'aria-hidden': true }, initial);
  // A link group's toggle takes its name from the rendered label, so a label that is a component still names it. A child's label is its link's whole content.
  const linkGroup = Boolean(href && items?.length);
  const body = (...trailing) => (child ? [label, ...trailing] : [leading, h('span', { id: linkGroup ? labelId : undefined, className: 'muxui-sidebar__nav-label' }, label), badge && h('span', { className: 'muxui-sidebar__nav-badge' }, badge), ...trailing]);
  const named = (node) => (child ? node : h(SidebarRailTooltip, { label }, node));
  const className = cx('muxui-sidebar__nav-link', child && 'muxui-sidebar__nav-child-link', current && 'muxui-sidebar__nav-link--current');
  const chevron = h(ChevronDownIcon, { className: 'muxui-sidebar__nav-chevron', 'aria-hidden': true, focusable: 'false' });
  const nested = items?.length ? h('ul', { ref: listRef, id: href ? listId : undefined, className: 'muxui-sidebar__nav-children', hidden: href ? !open : undefined }, items.map((entry, index) => h(SidebarNavNode, { key: entry.id ?? entry.href ?? index, ...entry, child: true }))) : null;
  let content;
  if (!nested) {
    content = named(h(AriaLink, { href, className, 'aria-current': current ? 'page' : undefined }, ...body(external && h(ExternalLinkIcon, { className: 'muxui-sidebar__nav-external', 'aria-hidden': true, focusable: 'false' }))));
  } else if (href) {
    content = h(React.Fragment, null,
      h('div', { className: 'muxui-sidebar__nav-row' },
        named(h(AriaLink, { id: child ? labelId : undefined, href, className, 'aria-current': current ? 'page' : undefined }, ...body())),
        h(AriaButton, { ref: controlRef, className: 'muxui-sidebar__nav-btn muxui-sidebar__nav-toggle', 'aria-labelledby': labelId, 'aria-expanded': open, 'aria-controls': listId, onPress: () => setOpen(!open) }, chevron)),
      nested);
  } else {
    // Folded, the group has no room to open: activating it unfolds the sidebar and opens the group.
    const onClick = (event) => { event.preventDefault(); if (sidebar?.collapsed) { sidebar.setCollapsed(false); setOpen(true); } else setOpen(!open); };
    const onToggle = (event) => { if (event.currentTarget.open === open) return; setOpen(event.currentTarget.open); rerender(); };
    content = h('details', { ref: detailsRef, open, onToggle }, named(h('summary', { ref: controlRef, className, onClick }, ...body(chevron))), nested);
  }
  return h('li', { className: 'muxui-sidebar__nav-item' }, content);
}
const Sidebar = {
  Provider: function SidebarProvider({ collapsed, defaultCollapsed = false, onCollapsedChange, shortcut, children }) {
    const controlled = collapsed !== undefined;
    const [internal, setInternal] = React.useState(defaultCollapsed);
    const [customRootId, setRootId] = React.useState(undefined);
    // Roots and Toggles register their elements for the shortcut's target check and for rescuing focus when folding hides it.
    const [roots] = React.useState(() => new Set());
    const [toggles] = React.useState(() => new Set());
    // The MobileTrigger menu buttons, so Root can hand focus to one when layout swaps the column for the drawer.
    const [menuButtons] = React.useState(() => new Set());
    // Counts fold requests so a pending Search focus can tell that another fold has happened since.
    const requests = React.useRef(0);
    const generatedRootId = React.useId();
    const current = controlled ? collapsed : internal;
    const latest = React.useRef({ controlled, current, onCollapsedChange });
    latest.current = { controlled, current, onCollapsedChange };
    const setCollapsed = React.useCallback((next) => { const state = latest.current; if (next === state.current) return; requests.current += 1; if (!state.controlled) setInternal(next); state.onCollapsedChange?.(next); }, []);
    const toggle = React.useCallback(() => setCollapsed(!latest.current.current), [setCollapsed]);
    // Precedence between Providers follows mount order. The sequence is assigned once, so a changed shortcut keeps it.
    const mounted = React.useRef(0);
    React.useEffect(() => {
      mounted.current ||= (sidebarMounts += 1);
      if (!shortcut) return undefined;
      const entry = { key: shortcut.toLowerCase(), toggle, order: mounted.current, nodes: () => [...roots, ...toggles] };
      if (sidebarShortcuts.size === 0) {
        document.addEventListener('keydown', onSidebarShortcutCapture, true);
        document.addEventListener('keydown', onSidebarShortcutBubble);
      }
      sidebarShortcuts.add(entry);
      return () => {
        sidebarShortcuts.delete(entry);
        if (sidebarShortcuts.size === 0) {
          document.removeEventListener('keydown', onSidebarShortcutCapture, true);
          document.removeEventListener('keydown', onSidebarShortcutBubble);
        }
      };
    }, [shortcut, toggle, roots, toggles]);
    const value = React.useMemo(() => ({ collapsed: current, setCollapsed, toggle, rootId: customRootId ?? generatedRootId, setRootId, roots, toggles, menuButtons, requests }), [current, setCollapsed, toggle, customRootId, generatedRootId, roots, toggles, menuButtons]);
    return h(SidebarContext.Provider, { value }, children);
  },
  Root: React.forwardRef(function SidebarRoot({ hideBorder = false, density = 'default', ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const node = React.useRef(null);
    React.useImperativeHandle(ref, () => node.current);
    const { roots, setRootId } = sidebar ?? {};
    // A caller-supplied id replaces the generated one so Toggle's aria-controls follows it.
    useIsomorphicLayoutEffect(() => { if (!setRootId || props.id === undefined) return undefined; setRootId(props.id); return () => setRootId(undefined); }, [setRootId, props.id]);
    useIsomorphicLayoutEffect(() => { const element = node.current; if (!roots) return undefined; roots.add(element); return () => roots.delete(element); }, [roots]);
    // Folding hides some content. If focus sat in it, move it to a control that survives: the group of a hidden
    // nested link, the folded Search button for the Search input, else the Toggle, else Root itself.
    useIsomorphicLayoutEffect(() => {
      const root = node.current;
      const active = root?.ownerDocument.activeElement;
      if (!sidebar?.collapsed || !root || !active || !root.contains(active) || !sidebarUnreachable(active)) return;
      const group = sidebarGroupHeader(active);
      const search = active.closest('.muxui-sidebar__search')?.querySelector('.muxui-sidebar__search-button');
      sidebarFocusFirst([group, search, ...sidebar.toggles, root], roots);
    }, [sidebar?.collapsed]);
    // When layout hides Root (the drawer took over) while focus is inside it, hand focus to the menu button if that is rendered.
    const { menuButtons } = sidebar ?? {};
    React.useEffect(() => {
      const root = node.current;
      if (!menuButtons || !root || typeof ResizeObserver === 'undefined') return undefined;
      // The browser may blur the hidden element before the observer runs, so remember that focus was inside while Root
      // rendered, starting with focus that arrived before this subscribed (autofocus). Focus a user sends elsewhere resets it.
      let inside = root.contains(document.activeElement);
      const track = (event) => {
        if (event.type === 'focusin') inside = true;
        else if (root.getClientRects().length > 0 || (event.relatedTarget && !root.contains(event.relatedTarget))) inside = false;
      };
      root.addEventListener('focusin', track);
      root.addEventListener('focusout', track);
      const observer = new ResizeObserver(() => {
        if (!inside || root.getClientRects().length > 0) return;
        inside = false;
        sidebarHandoff(() => [...menuButtons], roots, (active) => root.contains(active));
      });
      observer.observe(root);
      return () => {
        observer.disconnect();
        root.removeEventListener('focusin', track);
        root.removeEventListener('focusout', track);
      };
    }, [menuButtons, roots]);
    return h('aside', { ...props, ref: node, id: props.id ?? sidebar?.rootId, 'data-foldable': dataState(sidebar), 'data-collapsed': dataState(sidebar?.collapsed), 'data-density': density === 'compact' ? 'compact' : undefined, className: cx('muxui-sidebar', hideBorder && 'muxui-sidebar--no-border', props.className) });
  }),
  Toggle: React.forwardRef(function SidebarToggle({ onActivate, className, children, ...props }, ref) {
    const sidebar = useSidebarPart('Toggle');
    const node = React.useRef(null);
    React.useImperativeHandle(ref, () => node.current);
    const { toggles } = sidebar;
    useIsomorphicLayoutEffect(() => { const element = node.current; toggles.add(element); return () => toggles.delete(element); }, [toggles]);
    return h(IconButton, { 'aria-label': 'Toggle sidebar', ...props, ref: node, 'aria-expanded': !sidebar.collapsed, 'aria-controls': sidebar.rootId, className: cx('muxui-sidebar__toggle', className), onActivate: (event) => { onActivate?.(event); sidebar.toggle(); } }, children ?? h(PanelLeftIcon, { 'aria-hidden': true, focusable: 'false' }));
  }),
  Header: React.forwardRef(function SidebarHeader(props, ref) { return nativePart('div', 'muxui-sidebar__header', props, ref); }),
  Search: React.forwardRef(function SidebarSearch({ placeholder = 'Search', value, onChange, className, ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const inputRef = React.useRef(null);
    // Folded, the icon is a button that unfolds the sidebar and asks for the input's focus. A controlled parent may
    // apply the change later, so the request waits for Root to be expanded; it lapses if another fold happens or
    // the sidebar stays folded.
    const pending = React.useRef(null);
    const unfold = () => {
      sidebar.setCollapsed(false);
      clearTimeout(pending.current?.timer);
      pending.current = { request: sidebar.requests.current, timer: setTimeout(() => { pending.current = null; }, 1000) };
    };
    useIsomorphicLayoutEffect(() => {
      const wanted = pending.current;
      if (!wanted || !sidebar || sidebar.collapsed) return;
      clearTimeout(wanted.timer);
      pending.current = null;
      if (wanted.request === sidebar.requests.current) inputRef.current?.focus();
    }, [sidebar?.collapsed]);
    React.useEffect(() => () => clearTimeout(pending.current?.timer), []);
    return nativePart('div', 'muxui-sidebar__search', { ...props, className }, ref, h(React.Fragment, null,
      sidebar && h(SidebarRailTooltip, { label: placeholder }, h('button', { type: 'button', className: 'muxui-sidebar__nav-btn muxui-sidebar__search-button', 'aria-label': placeholder, onClick: unfold })),
      h(SearchIcon, { className: 'muxui-sidebar__search-icon', 'aria-hidden': true, focusable: 'false' }),
      h('input', { ref: inputRef, className: 'muxui-sidebar__search-input', placeholder, value, onChange, 'aria-label': placeholder })));
  }),
  Divider: React.forwardRef(function SidebarDivider(props, ref) { return nativePart('hr', 'muxui-sidebar__divider', props, ref); }),
  NavList: React.forwardRef(function SidebarNavList(props, ref) { return nativePart('ul', 'muxui-sidebar__nav-list', props, ref); }),
  Section: React.forwardRef(function SidebarSection({ label, className, children, ...props }, ref) { const labelId = React.useId(); return h('li', { ...props, ref, className: cx('muxui-sidebar__section', className) }, h('span', { id: labelId, className: 'muxui-sidebar__section-label' }, label), h('ul', { className: 'muxui-sidebar__section-items', 'aria-labelledby': labelId }, children)); }),
  NavItem: function SidebarNavItem({ children, ...props }) { return h(SidebarNavNode, { ...props, label: children }); },
  NavButton: React.forwardRef(function SidebarNavButton({ href, icon: Icon, label, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, 'aria-label': label, className: cx('muxui-sidebar__nav-btn', current && 'muxui-sidebar__nav-btn--current', className) }, Icon && h(Icon, { className: 'muxui-sidebar__nav-btn-icon', 'aria-hidden': true }), props.children); }),
  AccountCard: React.forwardRef(function SidebarAccountCard({ name, email, avatarSrc, avatarAlt, status, className, children, ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const card = React.useRef(null);
    React.useImperativeHandle(ref, () => card.current);
    const [open, setOpen] = React.useState(false);
    // A folded rail hides the options button, so a menu left open has nothing to anchor to or return focus to:
    // close it and hand focus to a Toggle, else Root.
    const collapsed = Boolean(sidebar?.collapsed);
    useIsomorphicLayoutEffect(() => {
      if (!collapsed || !open) return;
      setOpen(false);
      sidebarHandoff(() => [...sidebar.toggles, ...sidebar.roots], sidebar.roots, (active) => active.closest('[role="menu"]'));
    }, [collapsed]);
    // The options button exists to open an AccountMenu, so it shows only while one is mounted, however it is wrapped.
    // It stays in the tree, hidden, because the menu trigger around the card warns when it has no button to press.
    // One menu per card: two would open as two popovers over one trigger.
    const [hasMenu, setHasMenu] = React.useState(false);
    const registered = React.useRef(false);
    const register = React.useCallback(() => {
      if (registered.current) throw new Error('Sidebar.AccountCard takes one Sidebar.AccountMenu');
      registered.current = true;
      setHasMenu(true);
      return () => { registered.current = false; setHasMenu(false); };
    }, []);
    const account = React.useMemo(() => ({ anchor: card, register }), [register]);
    useIsomorphicLayoutEffect(() => { if (!hasMenu) setOpen(false); }, [hasMenu]);
    const content = h('div', { ...props, ref: card, className: cx('muxui-sidebar__account-card', className) }, h('div', { className: 'muxui-sidebar__account-avatar-wrap' }, avatarSrc ? h('img', { src: avatarSrc, alt: avatarAlt ?? name, className: 'muxui-sidebar__account-avatar' }) : h('div', { className: 'muxui-sidebar__account-avatar muxui-sidebar__account-avatar--placeholder', 'aria-hidden': true }, name?.charAt(0)), status && h('span', { className: `muxui-sidebar__account-status muxui-sidebar__account-status--${status}`, 'aria-label': status })), h('div', { className: 'muxui-sidebar__account-info' }, h('div', { className: 'muxui-sidebar__account-name' }, name), h('div', { className: 'muxui-sidebar__account-email' }, email)), h(IconButton, { hidden: !hasMenu, className: 'muxui-sidebar__account-trigger', 'aria-label': 'Account options' }, h(ChevronsUpDownIcon, { className: 'muxui-sidebar__account-trigger-icon', 'aria-hidden': true, focusable: 'false' })), children);
    return h(SidebarAccountContext.Provider, { value: account }, h(AriaMenuTrigger, { isOpen: open && hasMenu && !collapsed, onOpenChange: setOpen }, content));
  }),
  AccountMenu: React.forwardRef(function SidebarAccountMenu({ items, children, onAction, className }, ref) {
    const account = useSidebarAccount();
    useIsomorphicLayoutEffect(() => account.register(), [account.register]);
    // The popup opens from the card, not the small button, so it lines up with the card's edge.
    return h(Menu.Popup, { anchorRef: account.anchor, placement: 'top-start' }, h(Menu.List, { items, onAction, ref, className: cx('muxui-sidebar__account-menu', className) }, children));
  }),
  MobileTrigger: function SidebarMobileTrigger({ children, logo }) {
    const sidebar = React.useContext(SidebarContext);
    const [open, setOpen] = React.useState(false);
    const latest = React.useRef({ open, sidebar });
    latest.current = { open, sidebar };
    const header = React.useRef(null);
    const button = React.useRef(null);
    // The drawer's focused link and dialog when layout took it away, for the column link that should receive focus next.
    const handoff = React.useRef(null);
    const menuButtons = sidebar?.menuButtons;
    useIsomorphicLayoutEffect(() => { const element = button.current; if (!menuButtons) return undefined; menuButtons.add(element); return () => menuButtons.delete(element); }, [menuButtons]);
    // When layout hides this header (the column took over), an open drawer would be stranded: close it and hand focus to the column.
    React.useEffect(() => {
      if (!menuButtons || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => {
        if (!latest.current.open || header.current.getClientRects().length > 0) return;
        const dialog = document.activeElement?.closest('.muxui-sidebar__mobile-dialog') ?? null;
        handoff.current = { dialog, href: dialog ? document.activeElement.closest('a[href]')?.getAttribute('href') ?? null : null };
        setOpen(false);
      });
      observer.observe(header.current);
      return () => observer.disconnect();
    }, [menuButtons]);
    const exit = () => {
      const wanted = handoff.current;
      handoff.current = null;
      const { sidebar: current } = latest.current;
      if (wanted && current) sidebarHandoff(() => sidebarColumnCandidates(current, wanted.href), current.roots, (active) => wanted.dialog?.contains(active));
    };
    // The drawer is always full size, so its navigation ignores the folded state of the desktop sidebar.
    return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen },
      h('header', { ref: header, className: 'muxui-sidebar__mobile-header' }, logo && h('div', { className: 'muxui-sidebar__mobile-logo' }, logo), h(IconButton, { ref: button, className: 'muxui-sidebar__mobile-menu-btn', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' }))),
      h(AriaModalOverlay, { className: 'muxui-sidebar__mobile-overlay' }, h(AriaModal, { className: 'muxui-sidebar__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-sidebar__mobile-dialog' }, ({ close }) => h(SidebarContext.Provider, { value: null }, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-sidebar__mobile-close-row' }, h(IconButton, { size: 'sm', className: 'muxui-sidebar__mobile-close-btn', onActivate: close, 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children)))));
  },
  FeatureCard: React.forwardRef(function SidebarFeatureCard({ title, description, dismissLabel, onDismiss, ...props }, ref) { return nativePart('div', 'muxui-sidebar__feature-card', props, ref, h(React.Fragment, null, title && h('div', { className: 'muxui-sidebar__feature-card-title' }, title), description && h('div', { className: 'muxui-sidebar__feature-card-description' }, description), props.children, onDismiss && h('button', { type: 'button', className: 'muxui-sidebar__feature-card-dismiss', onClick: onDismiss }, dismissLabel ?? 'Dismiss'))); }),
};

export { ButtonGroup } from './button-group.mjs';
export { Card } from './card.mjs';
export { CheckboxField } from './checkbox-field.mjs';
export { ColorModeToggle } from './color-mode-toggle.mjs';
export { Input } from './input.mjs';
export { InputTags } from './input-tags.mjs';
export { PaymentInput } from './payment-input.mjs';
export { ProgressCircle } from './progress-circle.mjs';
export { RadioField } from './radio-field.mjs';
export { SwitchField } from './switch-field.mjs';
export { Text } from './text.mjs';
export { TextArea } from './text-area.mjs';

export { AlertDialog, CommandPalette, HeaderNav, Sidebar };

export const supplementalFamilies = Object.freeze([
  'AlertDialog', 'Avatar', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle', 'CommandPalette', 'HeaderNav', 'Image', 'InputTags', 'Input', 'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'SelectNative', 'Sidebar', 'SwitchField', 'TagSelect', 'TextArea', 'Text',
]);
