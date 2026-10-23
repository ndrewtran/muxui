import React from 'react';
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  Collection as AriaCollection,
  Dialog as AriaDialog,
  FieldInputContext as AriaFieldInputContext,
  Header as AriaHeader,
  Heading as AriaHeading,
  Input as AriaInput,
  InputContext as AriaInputContext,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  SearchField as AriaSearchField,
  useFilter,
  useLocale,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { Button as MuxUIButton } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { h, cx, dataState, nativePart, pressHandler } from './part-utils.mjs';
import { MotionModalBackdropForwardRef, MotionModalPopupForwardRef } from './modal-parts.mjs';

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
export const CommandPalette = /*#__PURE__*/ (() => ({
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
