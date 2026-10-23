import React from 'react';
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  SearchField as AriaSearchField,
  useFilter,
} from 'react-aria-components';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { PopoverMotion } from '../popover-motion.mjs';
import { h, cx, dataState } from './part-utils.mjs';
import { defaultItemLabel, useItemRenderer } from './item-renderer.mjs';

function normalizeKeys(value) {
  if (value === 'all') return 'all';
  return value instanceof Set ? value : new Set(value ?? []);
}

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
