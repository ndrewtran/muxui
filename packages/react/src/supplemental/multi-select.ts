import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, Key, ReactElement, ReactNode, RefAttributes } from 'react';
import { Autocomplete as AriaAutocomplete, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, useFilter } from 'react-aria-components';
import { AriaButton, AriaInput, AriaListBox, AriaListBoxItem, AriaSearchField } from '../substrate.ts';
import type { DialogTriggerProps as AriaDialogTriggerProps, ListBoxItemProps as AriaListBoxItemProps, Selection } from 'react-aria-components';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { PopoverMotion } from '../popover-motion.mjs';
import { h, cx, dataState } from './part-utils.ts';
import { defaultItemLabel, useItemRenderer } from './item-renderer.ts';

/** An item MultiSelect lists: a key, and whatever else the caller keeps on it. */
export type MultiSelectItem = { id: Key; [key: string]: unknown };

/**
 * The props Mux UI defines for MultiSelect.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). It is generic over the item the caller lists, as the public type is, and the catalog
 * records the item at its constraint. The members every field shares are written out, because the catalog's grammar
 * reads only the members a type lists itself.
 */
type MultiSelectOwnProps<T extends MultiSelectItem = MultiSelectItem> = {
  /** The control size. */
  size?: 'sm' | 'md' | 'lg';
  /** The visible label, which also names the list. */
  label?: ReactNode;
  /** The text shown while nothing is selected. */
  placeholder?: string;
  /** Supporting text shown below the control. */
  description?: ReactNode;
  /** The message shown, in place of the description, while the control is invalid. */
  errorMessage?: ReactNode;
  /** Marks the control disabled. */
  disabled?: boolean;
  /** Marks a selection as required. */
  required?: boolean;
  /** Marks the control invalid. */
  invalid?: boolean;
  /** Text shown beside the count of selected items. */
  supportingText?: ReactNode;
  /** The title shown when no item matches the search. */
  emptyStateTitle?: string;
  /** The message shown when no item matches the search. */
  emptyStateDescription?: string;
  /** The items to choose from. */
  items?: Iterable<T>;
  /** The selected keys, when the caller controls them; `'all'` selects every item that is not disabled. */
  selectedKeys?: Set<Key> | 'all';
  /** The keys selected at first, when the control keeps its own selection. */
  defaultSelectedKeys?: Set<Key>;
  /** Called with the new selection each time it changes. */
  onSelectionChange?: (keys: Set<Key> | 'all') => void;
  /** Shows the search field in the list. */
  showSearch?: boolean;
  /** Shows the Reset and Select all buttons below the list. */
  showFooter?: boolean;
  /** Called after Reset clears the selection. */
  onReset?: () => void;
  /** Called after Select all selects every item. */
  onSelectAll?: () => void;
  /** Formats the count of selected items shown in the trigger. */
  selectedCountFormatter?: (count: number) => ReactNode;
};

// The children are the item elements or a function that renders one for each item, so they stay in the public type with the item, not in the props the catalog lists. readOnly stays too, though MultiSelect does nothing with it and it reaches the root element as an attribute.
export type MultiSelectProps<T extends MultiSelectItem = MultiSelectItem> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & MultiSelectOwnProps<T> & {
  children?: ReactNode | ((item: T) => ReactNode);
  readOnly?: boolean;
};
export type MultiSelectRootProps<T extends MultiSelectItem = MultiSelectItem> = MultiSelectProps<T>;

/** The props Mux UI defines for MultiSelect.Item; its API is the item entry in the catalog's partApis. */
type MultiSelectItemOwnProps = {
  /** Marks the item disabled: it cannot be selected, and Select all skips it. */
  disabled?: boolean;
  /** The text that search and typeahead match, when the item's content is not plain text. */
  textValue?: string;
};

export type MultiSelectItemProps = HTMLAttributes<HTMLDivElement> & MultiSelectItemOwnProps;

export interface MultiSelectRootComponent {
  <T extends MultiSelectItem = MultiSelectItem>(props: MultiSelectRootProps<T> & RefAttributes<HTMLDivElement>): ReactElement | null;
}

type Keys = Set<Key> | 'all';

function normalizeKeys(value: Keys | Iterable<Key> | undefined | null): Keys {
  if (value === 'all') return 'all';
  return value instanceof Set ? value : new Set(value ?? []);
}

// MultiSelect has no label prop, so plain text content doubles as search text.
const multiSelectTextValue = (item: MultiSelectItem, rendered: ReactNode) => (
  typeof rendered === 'string' || typeof rendered === 'number' ? String(rendered) : defaultItemLabel(item)
);

// The all selection stands for every item that is not disabled. The ListBox collection that
// knows them exists only while the popup is open, so count them from the items and children.
function countEnabledItems(children: ReactNode | ((item: MultiSelectItem) => ReactNode), items: MultiSelectItem[] | undefined, renderItem: (item: MultiSelectItem) => ReactElement<{ disabled?: boolean }>) {
  if (typeof children === 'function') return (items ?? []).filter((item) => !renderItem(item).props.disabled).length;
  let count = 0;
  const visit = (nodes: ReactNode) => React.Children.forEach(nodes, (node) => {
    if (!React.isValidElement<{ children?: ReactNode; disabled?: boolean }>(node)) return;
    if (node.type === React.Fragment) visit(node.props.children);
    else if (!node.props.disabled) count += 1;
  });
  visit(children);
  return count;
}

/* MultiSelect */
// The children of a React Aria component that is rendered with its children as arguments, not in its props.
const CHILDREN_FOLLOW = undefined;
const MultiSelectContext = React.createContext({ size: 'md', close: () => {} });

const MultiSelectItemPart: ForwardRefExoticComponent<MultiSelectItemProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, MultiSelectItemProps>(function MultiSelectItem({ disabled = false, textValue, className, children, ...props }, ref) {
  // The native div attributes reach React Aria's ListBoxItem, whose props type names only its own.
  return h(AriaListBoxItem, {
    ...(props as AriaListBoxItemProps),
    textValue,
    ref,
    isDisabled: disabled,
    className: cx('muxui-multi-select__item', className),
    children: (renderProps) => h(React.Fragment, null, h('span', { className: 'muxui-multi-select__item-check', 'aria-hidden': true }, renderProps.isSelected && h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' }, h('path', { d: 'M2 6L5 9L10 3', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }))), h('span', { className: 'muxui-multi-select__item-text' }, typeof children === 'function' ? (children as (state: typeof renderProps) => ReactNode)(renderProps) : children)),
  });
});

const MultiSelectRoot: MultiSelectRootComponent = /*#__PURE__*/ React.forwardRef<HTMLDivElement, MultiSelectProps>(function MultiSelectRoot({ size = 'md', label, placeholder = 'Select', description, errorMessage, disabled = false, required = false, invalid = false, items, children, selectedKeys, defaultSelectedKeys, onSelectionChange, showSearch = true, showFooter = true, onReset, onSelectAll, selectedCountFormatter, supportingText, emptyStateTitle = 'No results found', emptyStateDescription = 'Please try a different search term.', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  const resolvedSize = normalizeChoiceControlSize(size, 'MultiSelect');
  const [query, setQuery] = React.useState('');
  const [popoverWidth, setPopoverWidth] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
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
  const renderItem = useItemRenderer(children, MultiSelectItemPart, multiSelectTextValue);
  const updateSelection = (next: Keys) => {
    if (!controlled) setInternalSelected(normalizeKeys(next));
    onSelectionChange?.(next);
  };
  const selectsAll = selected === 'all';
  const enabledCount = React.useMemo(() => (selectsAll ? countEnabledItems(children, allItems, renderItem as Parameters<typeof countEnabledItems>[2]) : 0), [selectsAll, children, allItems, renderItem]);
  const selectedCount = selectsAll ? enabledCount : selected.size;
  const [open, setOpen] = React.useState(false);
  const clearSearch = () => setQuery('');
  const search = showSearch && h('div', { className: 'muxui-multi-select__search-wrapper' }, h(AriaSearchField, { 'aria-label': 'Search', value: query, onChange: setQuery, autoFocus: true, className: 'muxui-multi-select__search' }, h(SearchIcon, { className: 'muxui-multi-select__search-icon', size: 16, 'aria-hidden': true, focusable: 'false' }), h(AriaInput, { placeholder: 'Search', className: 'muxui-multi-select__search-input' })));
  const empty = h('div', { className: 'muxui-multi-select__empty' }, h('p', { className: 'muxui-multi-select__empty-title' }, emptyStateTitle), h('p', { className: 'muxui-multi-select__empty-description' }, emptyStateDescription), query && h('button', { type: 'button', className: 'muxui-multi-select__empty-clear', onClick: clearSearch }, 'Clear search'));
  // Reset and Select all change the selection like a click on an item; the callbacks only notify.
  const reset = () => { updateSelection(new Set()); onReset?.(); };
  const selectAll = () => { updateSelection('all'); onSelectAll?.(); };
  const footer = showFooter && h('div', { className: 'muxui-multi-select__footer' }, h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: reset }, 'Reset'), h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: selectAll }, 'Select all'));
  const popup = h(PopoverMotion, { placement: 'bottom', offset: 4, containerPadding: 0, className: cx('muxui-multi-select__popup', resolvedSize !== 'md' && `muxui-multi-select__popup--${resolvedSize}`), ...{ 'data-muxui-size': resolvedSize }, style: { width: popoverWidth || undefined } }, h(AriaDialog, { className: 'muxui-multi-select__dialog' }, h(AriaAutocomplete, { filter: contains, inputValue: query, onInputChange: setQuery, children: CHILDREN_FOLLOW }, search, h(AriaListBox<MultiSelectItem>, { items: allItems, selectionMode: 'multiple', selectedKeys: selected as Selection, onSelectionChange: updateSelection as (keys: Selection) => void, escapeKeyBehavior: 'none', 'aria-label': typeof label === 'string' ? label : 'Options', renderEmptyState: () => empty, className: cx('muxui-multi-select__listbox', resolvedSize !== 'md' && `muxui-multi-select__listbox--${resolvedSize}`), ...{ 'data-muxui-size': resolvedSize }, children: CHILDREN_FOLLOW }, renderItem as ReactNode)), footer));
  const trigger = h(AriaButton, { ref: triggerRef, isDisabled: disabled, onClick: () => setPopoverWidth(`${triggerRef.current?.getBoundingClientRect().width ?? 0}px`), className: cx('muxui-multi-select__trigger', invalid && 'muxui-multi-select__trigger--invalid'), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? (ariaLabel === undefined && labelId ? labelId : undefined), 'aria-describedby': describedBy }, h('span', { className: cx('muxui-multi-select__trigger-inner', `muxui-multi-select__trigger-inner--${resolvedSize}`) }, h('span', { className: cx('muxui-multi-select__value', selectedCount ? 'muxui-multi-select__value--selected' : 'muxui-multi-select__value--placeholder') }, selectedCount ? h(React.Fragment, null, selectedCountFormatter?.(selectedCount) ?? `${selectedCount} selected`, supportingText && h('span', { className: 'muxui-multi-select__supporting-text' }, supportingText)) : placeholder), h('span', { className: 'muxui-multi-select__icon', 'aria-hidden': true }, h(ChevronDownIcon, { size: 16, focusable: 'false' }))));
  const select = h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen } as AriaDialogTriggerProps, trigger, popup);
  return h(MultiSelectContext.Provider, { value: { size: resolvedSize, close: () => setOpen(false) } }, h('div', { ...props, ref, className: cx('muxui-multi-select', `muxui-multi-select--${resolvedSize}`, className), 'data-muxui-size': resolvedSize, 'data-muxui-state-disabled': dataState(disabled), 'data-muxui-state-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-multi-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), select, status && h('span', { id: statusId, hidden: true }, status), showDescription && h('span', { id: descriptionId, className: 'muxui-multi-select__description' }, description), showError && h('span', { id: errorId, className: 'muxui-multi-select__error' }, errorMessage)));
}) as MultiSelectRootComponent;

export const MultiSelect: {
  Root: MultiSelectRootComponent;
  Item: ForwardRefExoticComponent<MultiSelectItemProps & RefAttributes<HTMLDivElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: MultiSelectRoot,
  Item: MultiSelectItemPart,
});
