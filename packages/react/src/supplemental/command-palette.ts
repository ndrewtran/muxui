import React from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, ContextType, ForwardRefExoticComponent, HTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, RefAttributes, RefObject } from 'react';
import { Autocomplete as AriaAutocomplete, AutocompleteStateContext as AriaAutocompleteStateContext, Collection as AriaCollection, Dialog as AriaDialog, FieldInputContext as AriaFieldInputContext, Header as AriaHeader, Heading as AriaHeading, InputContext as AriaInputContext, ListBoxSection as AriaListBoxSection, useFilter, useLocale } from 'react-aria-components';
import { AriaButton, AriaInput, AriaListBox, AriaListBoxItem, AriaSearchField } from '../substrate.ts';
import type {
  ButtonProps as AriaButtonProps,
  DialogProps as AriaDialogProps,
  InputProps as AriaInputProps,
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxProps as AriaListBoxProps,
  ListBoxRenderProps as AriaListBoxRenderProps,
  ListBoxSectionProps as AriaListBoxSectionProps,
  SearchFieldProps as AriaSearchFieldProps,
} from 'react-aria-components';
import CornerDownLeftIcon from 'lucide-react/dist/esm/icons/corner-down-left.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { Button as MuxUIButton } from '../button.ts';
import type { ButtonActivationEvent } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { h, cx, dataState, nativePart, pressHandler, useIsomorphicLayoutEffect } from './part-utils.ts';
import type { PartProps, SupplementalActivation } from './part-utils.ts';
import { MotionModalBackdropForwardRef, MotionModalPopupForwardRef } from './modal-parts.ts';

/**
 * The props Mux UI defines for CommandPalette.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). Trigger, Backdrop, Popup, Close, Content, SearchField, ClearButton, Item and Shortcut define theirs in the
 * OwnProps types below, and the other parts take native attributes only. They are type literals, not interfaces, so the
 * public props types stay assignable to Record<string, unknown>, as they were before the move.
 */
type CommandPaletteOwnProps = {
  /** Whether the palette is open, when the caller controls it. */
  open?: boolean;
  /** Whether the palette starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Called with the new open state each time the palette opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** The control size, which the trigger, the search input, the popup width and the result text follow. Result rows keep one height at every size. */
  size?: 'sm' | 'md' | 'lg';
  /** Whether activating an item closes the palette. An item can set its own. */
  closeOnSelect?: boolean;
};

/** The props Mux UI defines for CommandPalette.Trigger; its API is the trigger entry in the catalog's partApis. */
type CommandPaletteTriggerOwnProps = {
  /** Marks the trigger disabled. */
  disabled?: boolean;
  /** Called when the trigger is pressed, which opens the palette. */
  onActivate?: (event: SupplementalActivation) => void;
};

/** The props Mux UI defines for CommandPalette.Backdrop; its API is the backdrop entry in the catalog's partApis. */
type CommandPaletteBackdropOwnProps = {
  /** Whether pressing outside the popup closes the palette. */
  dismissable?: boolean;
  /** Whether the backdrop paints the modal scrim. Without it the backdrop is transparent but still covers the window, so an outside press still dismisses. */
  scrim?: boolean;
};

/** The props Mux UI defines for CommandPalette.Popup; its API is the popup entry in the catalog's partApis. */
type CommandPalettePopupOwnProps = {
  /** Whether the popup is a translucent, blurred surface that shows the page behind it. */
  translucent?: boolean;
};

/** The props Mux UI defines for CommandPalette.Close; its API is the close entry in the catalog's partApis. */
type CommandPaletteCloseOwnProps = {
  /** Marks the close control disabled. */
  disabled?: boolean;
  /** Called when the control is pressed, which closes the palette. */
  onActivate?: (event: SupplementalActivation) => void;
};

/** The props Mux UI defines for CommandPalette.Content; its API is the content entry in the catalog's partApis. */
type CommandPaletteContentOwnProps = {
  /** Keeps the first enabled item focused, and so the one Enter activates, until a navigation key moves the focus. */
  autoFocusFirst?: boolean;
};

/** The props Mux UI defines for CommandPalette.SearchField; its API is the search-field entry in the catalog's partApis. */
type CommandPaletteSearchFieldOwnProps = {
  /** The look of the field's input: `default` draws its border, `inline` leaves it borderless so the input blends into the popup. */
  variant?: 'default' | 'inline';
};

/** The props Mux UI defines for CommandPalette.ClearButton; its API is the clear-button entry in the catalog's partApis. */
type CommandPaletteClearButtonOwnProps = {
  /** Marks the clear button disabled. */
  disabled?: boolean;
};

/** The props Mux UI defines for CommandPalette.Item; its API is the item entry in the catalog's partApis. */
type CommandPaletteItemOwnProps = {
  /** The item's key, which onActivate reports. */
  id?: string;
  /** The visible title, which also names the item for typeahead. */
  title?: string;
  /** Supporting text shown after the title on the same line. */
  description?: string;
  /** The text typeahead matches when the item has no title. */
  textValue?: string;
  /** Makes the item a link to this address. */
  href?: string;
  /** Where the link opens, as the anchor's target attribute. */
  target?: string;
  /** Marks the item disabled: it cannot be activated. */
  disabled?: boolean;
  /** Whether activating this item closes the palette. It follows the root's closeOnSelect when unset. */
  closeOnSelect?: boolean;
  /** Called with the item's id when the item is activated. */
  onActivate?: (event: { id?: string }) => void;
};

/** The props Mux UI defines for CommandPalette.Shortcut; its API is the shortcut entry in the catalog's partApis. */
type CommandPaletteShortcutOwnProps = {
  /** The keys of the shortcut, each shown in a kbd element. The children show when there are none. */
  keys?: readonly string[];
};

type CommandPaletteSize = NonNullable<CommandPaletteOwnProps['size']>;

export type CommandPaletteRootProps = HTMLAttributes<HTMLDivElement> & CommandPaletteOwnProps;
export type CommandPaletteItemProps = HTMLAttributes<HTMLDivElement> & CommandPaletteItemOwnProps;
export interface CommandPaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: readonly string[];
  group?: string;
  icon?: ReactNode;
  shortcut?: readonly string[];
  disabled?: boolean;
  href?: string;
  target?: string;
  action?: () => void | Promise<void>;
  closeOnSelect?: boolean;
}
export interface CommandPaletteGroup<T extends CommandPaletteCommand = CommandPaletteCommand> {
  id: string;
  title: string;
  commands: readonly T[];
}
export interface UseCommandPaletteOptions<T extends CommandPaletteCommand> {
  commands: readonly T[];
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  filter?: false | ((command: T, query: string) => boolean);
  sort?: false | ((a: T, b: T, query: string) => number);
  groupBy?: (command: T) => string | null | undefined;
  getGroupTitle?: (groupId: string) => string;
  onAction?: (command: T) => void | Promise<void>;
  onError?: (error: unknown, command: T) => void;
  close?: () => void;
  closeOnSelect?: boolean;
}
export interface UseCommandPaletteReturn<T extends CommandPaletteCommand> {
  query: string;
  setQuery: (query: string) => void;
  filteredCommands: readonly T[];
  groupedCommands: readonly CommandPaletteGroup<T>[];
  runCommand: (commandOrId: T | string) => Promise<void>;
  getItemProps: (command: T) => CommandPaletteItemProps;
}
export type CommandPaletteTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string } & CommandPaletteTriggerOwnProps;
export type CommandPaletteBackdropProps = PartProps<HTMLDivElement> & CommandPaletteBackdropOwnProps;
export type CommandPalettePopupProps = PartProps<HTMLElement> & CommandPalettePopupOwnProps;
export type CommandPaletteTitleProps = PartProps<HTMLHeadingElement>;
export type CommandPaletteDescriptionProps = PartProps<HTMLParagraphElement>;
export type CommandPaletteCloseProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string } & CommandPaletteCloseOwnProps;
export type CommandPaletteContentProps = PartProps<HTMLDivElement> & CommandPaletteContentOwnProps;
export type CommandPaletteSearchFieldProps = HTMLAttributes<HTMLDivElement> & CommandPaletteSearchFieldOwnProps;
export type CommandPaletteInputProps = InputHTMLAttributes<HTMLInputElement>;
// ClearButton takes onActivate in its type and does nothing with it, so the clear button owns it no more than the catalog says.
export type CommandPaletteClearButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string; onActivate?: (event: SupplementalActivation) => void } & CommandPaletteClearButtonOwnProps;
// Static children, or items with a render function that returns one element per item.
// A render function without items renders nothing, and items without a render function are ignored.
export type CommandPaletteItemsProps<T> =
  | { items?: undefined; dependencies?: undefined; children?: ReactNode }
  | { items: Iterable<T>; dependencies?: readonly unknown[]; children: (item: T) => ReactElement };
export type CommandPaletteListBoxProps<T = unknown> = Omit<PartProps<HTMLDivElement>, 'children'> & CommandPaletteItemsProps<T>;
export type CommandPaletteSectionProps<T = unknown> = Omit<PartProps<HTMLElement>, 'children'> & CommandPaletteItemsProps<T>;
export type CommandPaletteSectionHeaderProps = PartProps<HTMLElement>;
export type CommandPaletteSeparatorProps = PartProps<HTMLHRElement>;
export type CommandPaletteItemIconProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemContentProps = PartProps<HTMLDivElement>;
export type CommandPaletteItemTitleProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemDescriptionProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemMetaProps = PartProps<HTMLSpanElement>;
export type CommandPaletteItemActionProps = PartProps<HTMLSpanElement>;
export type CommandPaletteShortcutProps = PartProps<HTMLSpanElement> & CommandPaletteShortcutOwnProps;
export type CommandPaletteLoadMoreItemProps = PartProps<HTMLDivElement>;
export type CommandPaletteCollectionProps<T = unknown> = CommandPaletteItemsProps<T>;
export type CommandPaletteEmptyProps = PartProps<HTMLDivElement>;
export type CommandPaletteFooterProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipsProps = PartProps<HTMLDivElement>;
export type CommandPaletteChipProps = PartProps<HTMLSpanElement>;
export type CommandPaletteChipRemoveProps = ButtonHTMLAttributes<HTMLButtonElement>;
export interface CommandPaletteListBoxComponent {
  <T = unknown>(props: CommandPaletteListBoxProps<T> & RefAttributes<HTMLDivElement>): ReactElement | null;
}
export interface CommandPaletteSectionComponent {
  <T = unknown>(props: CommandPaletteSectionProps<T> & RefAttributes<HTMLElement>): ReactElement | null;
}
export interface CommandPaletteCollectionComponent {
  <T = unknown>(props: CommandPaletteCollectionProps<T>): ReactElement | null;
}

/* CommandPalette */
// The declared signature names its one parameter, which the implementation takes apart in place.
export function useCommandPalette<T extends CommandPaletteCommand>(options: UseCommandPaletteOptions<T>): UseCommandPaletteReturn<T>;
export function useCommandPalette<T extends CommandPaletteCommand>({ commands, query: controlledQuery, defaultQuery = '', onQueryChange, filter, sort, groupBy, getGroupTitle, onAction, onError, close, closeOnSelect = true }: UseCommandPaletteOptions<T>): UseCommandPaletteReturn<T> {
  const [internalQuery, setInternalQuery] = React.useState(defaultQuery);
  const query = controlledQuery ?? internalQuery;
  const { contains, startsWith } = useFilter({ sensitivity: 'base' });
  const { locale } = useLocale();
  const collator = React.useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' }), [locale]);
  const setQuery = React.useCallback((next: string) => {
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
    const rank = (command: T) => {
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
    const groups = new Map<string, { id: string; title: string; commands: T[] }>();
    for (const command of filteredCommands) {
      const id = (groupBy ? groupBy(command) : command.group) ?? '';
      if (!groups.has(id)) groups.set(id, { id, title: getGroupTitle ? getGroupTitle(id) : id, commands: [] });
      groups.get(id)!.commands.push(command);
    }
    return [...groups.values()];
  }, [filteredCommands, groupBy, getGroupTitle]);
  const runCommand = React.useCallback(async (commandOrId: T | string) => {
    const command = typeof commandOrId === 'string' ? commands.find(({ id }) => id === commandOrId) : commandOrId;
    if (!command || command.disabled) return;
    await command.action?.();
    await onAction?.(command);
    if (command.closeOnSelect ?? closeOnSelect) close?.();
  }, [commands, onAction, close, closeOnSelect]);
  const getItemProps = React.useCallback((command: T): CommandPaletteItemProps => ({
    id: command.id, title: command.title, description: command.subtitle, textValue: command.title,
    href: command.href, target: command.target, disabled: command.disabled,
    // The hook dismisses only after successful asynchronous actions.
    closeOnSelect: false,
    onActivate: () => runCommand(command).catch((error: unknown) => {
      if (onError) onError(error, command);
      else if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
      else console.error(error);
    }),
  }), [runCommand, onError]);
  return { query, setQuery, filteredCommands, groupedCommands, runCommand, getItemProps };
}

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
  size: CommandPaletteSize;
  closeOnSelect: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
};
const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(null);
const COMMAND_PALETTE_SIZES: ReadonlySet<string> = new Set(['sm', 'md', 'lg']);
function normalizeCommandPaletteSize(size: CommandPaletteSize | undefined): CommandPaletteSize {
  const resolved = size ?? 'md';
  if (!COMMAND_PALETTE_SIZES.has(resolved)) {
    throw new TypeError(`CommandPalette size must be one of: ${[...COMMAND_PALETTE_SIZES].join(', ')}`);
  }
  return resolved;
}
function useCommandPart(part: string) { const context = React.useContext(CommandPaletteContext); if (!context) throw new Error(`CommandPalette.${part} must be used inside CommandPalette.Root`); return context; }
// What Content shares with its Input and ListBox for autoFocusFirst: the Input reports the query, which the ListBox follows.
type CommandPaletteContentContextValue = { autoFocusFirst: boolean; query: string; setQuery: (query: string) => void };
const CommandPaletteContentContext = React.createContext<CommandPaletteContentContextValue | null>(null);
/** The Input's query reporter under autoFocusFirst, and nothing otherwise. */
function useReportQuery() {
  const content = React.useContext(CommandPaletteContentContext);
  return content?.autoFocusFirst ? content.setQuery : undefined;
}
// What Autocomplete's FieldInputContext supplies: the field's value and change callback beside the props its input takes.
type FieldInputContextValue = Exclude<NonNullable<ContextType<typeof AriaFieldInputContext>>, { slots?: unknown }>;
function CommandPaletteInputProvider({ children }: { children?: ReactNode }) {
  // Autocomplete supplies field-level callbacks. Bridge them to a native Input
  // without adding a wrapper or taking ownership of its value/defaultValue.
  const { value: _value, onChange, ...inputProps } = React.useContext(AriaFieldInputContext) as FieldInputContextValue;
  return h(AriaInputContext.Provider, {
    value: { ...inputProps, onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value) } as AriaInputProps,
  }, children);
}

// The native attributes of a part reach the React Aria component it renders, whose props type names only its own.
const CommandPaletteRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteRootProps>(function CommandPaletteRoot({ open, defaultOpen = false, onOpenChange, size = 'md', closeOnSelect = true, className, children, ...props }, ref) {
  const resolvedSize = normalizeCommandPaletteSize(size);
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const currentOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => { if (!controlled) setInternalOpen(next); onOpenChange?.(next); };
  return h(CommandPaletteContext.Provider, { value: { open: currentOpen, setOpen, size: resolvedSize, closeOnSelect, triggerRef } }, h('div', { ...props, ref, className: cx('muxui-command-palette', resolvedSize !== 'md' && `muxui-command-palette--${resolvedSize}`, className), 'data-muxui-size': resolvedSize, 'data-muxui-state-open': dataState(currentOpen) }, children));
});
const CommandPaletteTrigger = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, CommandPaletteTriggerProps>(function CommandPaletteTrigger({ disabled = false, onActivate, className, ...props }, ref) {
  const { setOpen, size, triggerRef } = useCommandPart('Trigger');
  const setRef = React.useCallback((node: HTMLButtonElement | null) => { triggerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }, [ref, triggerRef]);
  return h(AriaButton, { ...(props as AriaButtonProps), ref: setRef, isDisabled: disabled, onPress: (event) => { pressHandler(onActivate)?.(event); setOpen(true); }, ...{ 'data-muxui-size': size }, className: cx('muxui-command-palette__trigger', className) });
});
const CommandPaletteBackdrop = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteBackdropProps>(function CommandPaletteBackdrop({ dismissable = true, scrim = false, className, ...props }, ref) {
  const { open, setOpen, triggerRef } = useCommandPart('Backdrop');
  return h(MotionModalBackdropForwardRef, { ...props, ref, triggerRef, isOpen: open, onOpenChange: setOpen, isDismissable: dismissable, className: cx('muxui-command-palette__backdrop', !scrim && 'muxui-command-palette__backdrop--transparent', className) });
});
const CommandPalettePopup = /*#__PURE__*/ React.forwardRef<HTMLElement, CommandPalettePopupProps>(function CommandPalettePopup({ translucent = false, className, children, ...props }, ref) {
  // className reaches the dialog inside the popup, so the translucent modifier is the popup's own prop. A translucent
  // popup opens and closes at full opacity: a fade would show the page through it unblurred.
  return h(MotionModalPopupForwardRef, { className: cx('muxui-command-palette__popup', translucent && 'muxui-command-palette__popup--translucent'), fade: !translucent }, h(AriaDialog, { ...(props as AriaDialogProps), ref, className: cx('muxui-command-palette__dialog', className) }, children));
});
const CommandPaletteTitle = /*#__PURE__*/ React.forwardRef<HTMLHeadingElement, CommandPaletteTitleProps>(function CommandPaletteTitle({ className, ...props }, ref) {
  return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-command-palette__title', className) });
});
const CommandPaletteDescription = /*#__PURE__*/ React.forwardRef<HTMLParagraphElement, CommandPaletteDescriptionProps>(function CommandPaletteDescription(props, ref) { return nativePart('p', 'muxui-command-palette__description', props, ref); });
const CommandPaletteClose = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, CommandPaletteCloseProps>(function CommandPaletteClose({ disabled = false, onActivate, className, children, ...props }, ref) {
  const { setOpen } = useCommandPart('Close');
  const handleActivate = (event: ButtonActivationEvent) => { pressHandler(onActivate)?.(event); setOpen(false); };
  const buttonProps = { ...props, ref, disabled, size: 'sm' as const, variant: 'ghost' as const, onActivate: handleActivate, className: cx('muxui-command-palette__close', className) };
  return children === null || children === undefined
    ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Close' }, h(XIcon, { className: 'muxui-command-palette__close-icon', size: 16, 'aria-hidden': true, focusable: 'false' }))
    : h(MuxUIButton, buttonProps, children);
});
const CommandPaletteContent = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteContentProps>(function CommandPaletteContent({ autoFocusFirst = false, className, children, ...props }, ref) {
  const [query, setQuery] = React.useState('');
  const content = React.useMemo(() => ({ autoFocusFirst, query, setQuery }), [autoFocusFirst, query]);
  return h('div', { ...props, ref, className: cx('muxui-command-palette__content', className) }, h(AriaAutocomplete, null, h(CommandPaletteContentContext.Provider, { value: content }, h(CommandPaletteInputProvider, null, children))));
});
type ListState = AriaListBoxRenderProps['state'];
/** The first enabled item of the list, through its sections. */
function firstItemKey({ collection, selectionManager }: ListState) {
  for (let key = collection.getFirstKey(); key !== null; key = collection.getKeyAfter(key)) {
    if (collection.getItem(key)?.type === 'item' && !selectionManager.isDisabled(key)) return key;
  }
  return null;
}
/**
 * The ListBox element under autoFocusFirst. It focuses the first item on mount and after each query change, and keeps
 * the focus on whatever item is first (items that arrive or leave) until the user moves it to another item: a key in
 * the input, or the application's own focus change, such as on hover. When the focused item leaves or is disabled and
 * React Aria moves the focus to no item, the input's active descendant stays on the old item. That is never the
 * user's move: the focus goes back to the first enabled item, also after the user moved it. React Aria
 * focuses the first item only after typed text, and clears the focus after a deletion, a paste, a query the
 * application sets, a caret move or a press in the input. All of it waits until the search input has DOM focus: the Autocomplete moves DOM focus to its input
 * when an item takes virtual focus, so focusing an item while a button or a menu has focus would take focus from them.
 * The input's next focus then applies it.
 *
 * Enter and the other keys go to the item the Autocomplete last saw take virtual focus, which it tracks apart from the
 * active descendant. An item announces its focus only when the active descendant names another element, so a focus
 * that lands on the item the active descendant still names (set late after typed text, or by this list) never reaches
 * the Autocomplete. After each commit the list repeats that virtual focus on the focused item when the Autocomplete has
 * not seen it, so the highlight, the active descendant and Enter name one item.
 */
function CommandPaletteFocusFirstList({ domProps, state, query }: { domProps: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>; state: ListState; query: string }) {
  const { ref: forwardedRef, ...props } = domProps;
  const list = React.useRef<HTMLDivElement | null>(null);
  // A stable ref: a new callback each render would detach and reattach the list, which the Autocomplete tracks as state.
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    list.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.RefObject<HTMLDivElement | null>).current = node;
  }, [forwardedRef]);
  // A reset waiting for the input's focus, and the first item while the focus follows it.
  const pending = React.useRef(true);
  const held = React.useRef<ListState['selectionManager']['focusedKey']>(null);
  // The input's active descendant, which this list cleared while no item could be focused. The Autocomplete ignores a
  // focus on the item it still remembers, so the next focused item is named after its focus.
  const autocomplete = React.useContext(AriaAutocompleteStateContext);
  const cleared = React.useRef(false);
  // The id of the item that last took virtual focus, which is the item the Autocomplete sends keys to.
  const virtual = React.useRef<string | null>(null);
  const apply = React.useRef(() => {});
  apply.current = () => {
    const node = list.current;
    if (!node) return;
    const { collection, selectionManager } = state;
    const key = selectionManager.focusedKey;
    const listed = key !== null && collection.getItem(key)?.type === 'item' && !selectionManager.isDisabled(key);
    // The focus moved to another listed item while the held one is still listed: the user chose it.
    if (held.current !== null && listed && key !== held.current && collection.getItem(held.current)) held.current = null;
    // The search input names the list it controls.
    if (node.ownerDocument.activeElement?.getAttribute('aria-controls') !== node.id) return;
    if (!pending.current && held.current === null) {
      if (listed) {
        // The Autocomplete clears the virtual focus on a caret move or a press in the input; give it back to the item.
        if (!selectionManager.isFocused) selectionManager.setFocused(true);
        return;
      }
      // The chosen item left or was disabled: follow the first item again.
      pending.current = true;
    }
    const first = firstItemKey(state);
    if (first === null) {
      // No item is left to focus, or every one is disabled: the input names none of them.
      if (key === null && autocomplete?.focusedNodeId) {
        autocomplete.setFocusedNodeId(null);
        cleared.current = true;
      }
      return;
    }
    pending.current = false;
    held.current = first;
    if (selectionManager.isFocused && selectionManager.focusedKey === first) return;
    selectionManager.setFocused(true);
    selectionManager.setFocusedKey(first);
  };
  useIsomorphicLayoutEffect(() => { pending.current = true; }, [query]);
  useIsomorphicLayoutEffect(() => apply.current());
  // After the items' own effects, so a focus they announced is not repeated.
  React.useEffect(() => {
    const node = list.current;
    const { collection, selectionManager } = state;
    const key = selectionManager.focusedKey;
    if (!node || !selectionManager.isFocused || key === null || collection.getItem(key)?.type !== 'item' || selectionManager.isDisabled(key)) return;
    // Without DOM focus in the input the Autocomplete would move it there.
    if (node.ownerDocument.activeElement?.getAttribute('aria-controls') !== node.id) return;
    const option = node.querySelector<HTMLElement>(`[data-key="${CSS.escape(String(key))}"]`);
    if (!option?.id) return;
    if (virtual.current !== option.id) {
      // The virtual focus move React Aria makes, from the item the Autocomplete last saw.
      const from = virtual.current === null ? null : node.ownerDocument.getElementById(virtual.current);
      from?.dispatchEvent(new FocusEvent('blur', { relatedTarget: option }));
      from?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: option }));
      option.dispatchEvent(new FocusEvent('focus', { relatedTarget: from }));
      option.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: from }));
    }
    if (cleared.current) {
      cleared.current = false;
      autocomplete?.setFocusedNodeId(option.id);
    }
  });
  React.useEffect(() => {
    const node = list.current;
    const doc = node?.ownerDocument;
    const onFocusIn = () => apply.current();
    // Virtual focus is an untrusted focus event on an item, as React Aria dispatches it.
    const onVirtualFocus = (event: FocusEvent) => {
      if (!event.isTrusted && event.target instanceof HTMLElement && event.target !== node && event.target.id) virtual.current = event.target.id;
    };
    // The Autocomplete fires this on the list when it forgets the item, after a deletion, a caret move or a press in the input.
    const onClearFocus = () => { virtual.current = null; };
    node?.addEventListener('focusin', onVirtualFocus);
    node?.addEventListener('react-aria-clear-focus', onClearFocus);
    doc?.addEventListener('focusin', onFocusIn);
    return () => {
      node?.removeEventListener('focusin', onVirtualFocus);
      node?.removeEventListener('react-aria-clear-focus', onClearFocus);
      doc?.removeEventListener('focusin', onFocusIn);
    };
  }, []);
  return h('div', { ...props, ref });
}
const CommandPaletteSearchField = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteSearchFieldProps>(function CommandPaletteSearchField({ variant = 'inline', className, ...props }, ref) {
  return h(AriaSearchField, { ...(props as AriaSearchFieldProps), ref, 'aria-label': props['aria-label'] ?? 'Search commands', className: cx('muxui-command-palette__search-field', `muxui-command-palette__search-field--${variant}`, className) });
});
const CommandPaletteInput = /*#__PURE__*/ React.forwardRef<HTMLInputElement, CommandPaletteInputProps>(function CommandPaletteInput({ disabled, className, onKeyDown, ...props }, ref) {
  const { size } = useCommandPart('Input');
  const { onKeyDown: navigate, ...inputContext } = React.useContext(AriaInputContext) as AriaInputProps;
  // The query is the application's value, or else the text the Autocomplete holds, which typing and a SearchField's
  // clear both change.
  const reportQuery = useReportQuery();
  const autocomplete = React.useContext(AriaAutocompleteStateContext);
  const query = props.value === undefined ? autocomplete?.inputValue ?? '' : String(props.value);
  useIsomorphicLayoutEffect(() => { reportQuery?.(query); }, [reportQuery, query]);
  return h(AriaInputContext.Provider, { value: inputContext }, h(AriaInput, {
    ...(props as AriaInputProps), ref, disabled, autoFocus: props.autoFocus ?? true, ...{ 'data-muxui-size': size },
    className: cx('muxui-command-palette__input', className),
    onKeyDown(event) {
      onKeyDown?.(event);
      // The Autocomplete repeats each key on the focused item. WebKit takes a repeated Backspace on that item, which is
      // not editable, as Back and leaves the page; the list has no use for it, so Backspace stays with the input.
      if (!event.defaultPrevented && event.key !== 'Backspace') navigate?.(event);
    },
  }));
});
const CommandPaletteClearButton = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, CommandPaletteClearButtonProps>(function CommandPaletteClearButton({ disabled = false, className, children, ...props }, ref) {
  return h(AriaButton, { ...(props as AriaButtonProps), ref, isDisabled: disabled, ...{ 'data-muxui-variant': 'ghost', 'data-muxui-size': 'sm' }, className: cx('muxui-button', 'muxui-command-palette__clear-button', className) }, children ?? 'Clear');
});
// ListBox, Section and Collection are generic over the item they list, which the public component types say and a forwardRef component does not.
const CommandPaletteListBox = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteListBoxProps>(function CommandPaletteListBox({ className, ...props }, ref) {
  const { size } = useCommandPart('ListBox');
  const content = React.useContext(CommandPaletteContentContext);
  const query = content?.query ?? '';
  const render = content?.autoFocusFirst
    ? (domProps: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>, { state }: AriaListBoxRenderProps) => h(CommandPaletteFocusFirstList, { domProps, state, query })
    : undefined;
  return h(AriaListBox<object>, { ...(props as AriaListBoxProps<object>), ref, render, 'aria-label': props['aria-label'] ?? 'Command results', ...{ 'data-muxui-size': size }, className: cx('muxui-command-palette__listbox', size !== 'md' && `muxui-command-palette__listbox--${size}`, className) });
}) as unknown as CommandPaletteListBoxComponent;
const CommandPaletteSection = /*#__PURE__*/ React.forwardRef<HTMLElement, CommandPaletteSectionProps>(function CommandPaletteSection({ className, ...props }, ref) {
  return h(AriaListBoxSection<object>, { ...(props as AriaListBoxSectionProps<object>), ref, className: cx('muxui-command-palette__section', className) });
}) as unknown as CommandPaletteSectionComponent;
const CommandPaletteSectionHeader = /*#__PURE__*/ React.forwardRef<HTMLElement, CommandPaletteSectionHeaderProps>(function CommandPaletteSectionHeader(props, ref) {
  return h(AriaHeader, { ...props, ref, className: cx('muxui-command-palette__section-header', props.className) });
});
const CommandPaletteItem = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteItemProps>(function CommandPaletteItem({ id, title, description, textValue, href, target, disabled = false, closeOnSelect, onActivate, className, children, ...props }, ref) {
  const { setOpen, closeOnSelect: defaultClose } = useCommandPart('Item');
  const shouldClose = closeOnSelect === undefined || closeOnSelect === null ? defaultClose : closeOnSelect;
  return h(AriaListBoxItem, { ...(props as AriaListBoxItemProps), ref, id, textValue: title === undefined || title === null ? textValue : title, href, target, isDisabled: disabled, onAction: () => { onActivate?.({ id }); if (shouldClose) setOpen(false); }, className: cx('muxui-command-palette__item', className) }, children ?? h('div', { className: 'muxui-command-palette__item-content' }, title && h('span', { className: 'muxui-command-palette__item-title' }, title), description && h('span', { className: 'muxui-command-palette__item-description' }, description)));
});
const CommandPaletteSeparator = /*#__PURE__*/ React.forwardRef<HTMLHRElement, CommandPaletteSeparatorProps>(function CommandPaletteSeparator(props, ref) { return nativePart('hr', 'muxui-command-palette__separator', props, ref); });
const CommandPaletteCollection: CommandPaletteCollectionComponent = AriaCollection as unknown as CommandPaletteCollectionComponent;
const CommandPaletteItemIcon = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteItemIconProps>(function CommandPaletteItemIcon(props, ref) { return nativePart('span', 'muxui-command-palette__item-icon', props, ref); });
const CommandPaletteItemContent = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteItemContentProps>(function CommandPaletteItemContent(props, ref) { return nativePart('div', 'muxui-command-palette__item-content', props, ref); });
const CommandPaletteItemTitle = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteItemTitleProps>(function CommandPaletteItemTitle(props, ref) { return nativePart('span', 'muxui-command-palette__item-title', props, ref); });
const CommandPaletteItemDescription = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteItemDescriptionProps>(function CommandPaletteItemDescription(props, ref) { return nativePart('span', 'muxui-command-palette__item-description', props, ref); });
const CommandPaletteItemMeta = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteItemMetaProps>(function CommandPaletteItemMeta(props, ref) { return nativePart('span', 'muxui-command-palette__item-meta', props, ref); });
// The label shows only while its Item is focused, so it joins the option's accessible name then; the Enter key cap is decoration.
const CommandPaletteItemAction = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteItemActionProps>(function CommandPaletteItemAction({ children, ...props }, ref) {
  return nativePart('span', 'muxui-command-palette__item-action', props, ref, h(React.Fragment, null,
    h('span', { className: 'muxui-command-palette__item-action-label' }, children),
    h('span', { className: 'muxui-command-palette__item-action-key', 'aria-hidden': true }, h(CornerDownLeftIcon, { className: 'muxui-command-palette__item-action-icon', 'aria-hidden': true, focusable: 'false' }))));
});
const CommandPaletteShortcut = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteShortcutProps>(function CommandPaletteShortcut({ keys, children, 'aria-hidden': ariaHidden = true, ...props }, ref) {
  return nativePart('span', 'muxui-command-palette__shortcut', { ...props, 'aria-hidden': ariaHidden }, ref, keys ? keys.map((key) => h('kbd', { key, className: 'muxui-command-palette__shortcut-key' }, key)) : children);
});
const CommandPaletteLoadMoreItem = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteLoadMoreItemProps>(function CommandPaletteLoadMoreItem(props, ref) { return nativePart('div', 'muxui-command-palette__load-more-item', { ...props, role: 'presentation' }, ref); });
const CommandPaletteEmpty = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteEmptyProps>(function CommandPaletteEmpty(props, ref) { return nativePart('div', 'muxui-command-palette__empty', props, ref); });
const CommandPaletteFooter = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteFooterProps>(function CommandPaletteFooter(props, ref) { return nativePart('div', 'muxui-command-palette__footer', props, ref); });
const CommandPaletteChips = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CommandPaletteChipsProps>(function CommandPaletteChips(props, ref) { return nativePart('div', 'muxui-command-palette__chips', props, ref); });
const CommandPaletteChip = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CommandPaletteChipProps>(function CommandPaletteChip(props, ref) { return nativePart('span', 'muxui-command-palette__chip', props, ref); });
const CommandPaletteChipRemove = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, CommandPaletteChipRemoveProps>(function CommandPaletteChipRemove({ disabled = false, children, ...props }, ref) {
  const buttonProps = { ...props, ref, type: 'button' as const, disabled, className: cx('muxui-command-palette__chip-remove', props.className) };
  return children === null || children === undefined
    ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Remove chip' }, h(XIcon, { className: 'muxui-command-palette__chip-remove-icon', size: 14, 'aria-hidden': true, focusable: 'false' }))
    : h('button', buttonProps, children);
});

export const CommandPalette: {
  Root: ForwardRefExoticComponent<CommandPaletteRootProps & RefAttributes<HTMLDivElement>>;
  Trigger: ForwardRefExoticComponent<CommandPaletteTriggerProps & RefAttributes<HTMLButtonElement>>;
  Backdrop: ForwardRefExoticComponent<CommandPaletteBackdropProps & RefAttributes<HTMLDivElement>>;
  Popup: ForwardRefExoticComponent<CommandPalettePopupProps & RefAttributes<HTMLElement>>;
  Title: ForwardRefExoticComponent<CommandPaletteTitleProps & RefAttributes<HTMLHeadingElement>>;
  Description: ForwardRefExoticComponent<CommandPaletteDescriptionProps & RefAttributes<HTMLParagraphElement>>;
  Close: ForwardRefExoticComponent<CommandPaletteCloseProps & RefAttributes<HTMLButtonElement>>;
  Content: ForwardRefExoticComponent<CommandPaletteContentProps & RefAttributes<HTMLDivElement>>;
  SearchField: ForwardRefExoticComponent<CommandPaletteSearchFieldProps & RefAttributes<HTMLDivElement>>;
  Input: ForwardRefExoticComponent<CommandPaletteInputProps & RefAttributes<HTMLInputElement>>;
  ClearButton: ForwardRefExoticComponent<CommandPaletteClearButtonProps & RefAttributes<HTMLButtonElement>>;
  ListBox: CommandPaletteListBoxComponent;
  Section: CommandPaletteSectionComponent;
  SectionHeader: ForwardRefExoticComponent<CommandPaletteSectionHeaderProps & RefAttributes<HTMLElement>>;
  Item: ForwardRefExoticComponent<CommandPaletteItemProps & RefAttributes<HTMLDivElement>>;
  Separator: ForwardRefExoticComponent<CommandPaletteSeparatorProps & RefAttributes<HTMLHRElement>>;
  Collection: CommandPaletteCollectionComponent;
  ItemIcon: ForwardRefExoticComponent<CommandPaletteItemIconProps & RefAttributes<HTMLSpanElement>>;
  ItemContent: ForwardRefExoticComponent<CommandPaletteItemContentProps & RefAttributes<HTMLDivElement>>;
  ItemTitle: ForwardRefExoticComponent<CommandPaletteItemTitleProps & RefAttributes<HTMLSpanElement>>;
  ItemDescription: ForwardRefExoticComponent<CommandPaletteItemDescriptionProps & RefAttributes<HTMLSpanElement>>;
  ItemMeta: ForwardRefExoticComponent<CommandPaletteItemMetaProps & RefAttributes<HTMLSpanElement>>;
  ItemAction: ForwardRefExoticComponent<CommandPaletteItemActionProps & RefAttributes<HTMLSpanElement>>;
  Shortcut: ForwardRefExoticComponent<CommandPaletteShortcutProps & RefAttributes<HTMLSpanElement>>;
  LoadMoreItem: ForwardRefExoticComponent<CommandPaletteLoadMoreItemProps & RefAttributes<HTMLDivElement>>;
  Empty: ForwardRefExoticComponent<CommandPaletteEmptyProps & RefAttributes<HTMLDivElement>>;
  Footer: ForwardRefExoticComponent<CommandPaletteFooterProps & RefAttributes<HTMLDivElement>>;
  Chips: ForwardRefExoticComponent<CommandPaletteChipsProps & RefAttributes<HTMLDivElement>>;
  Chip: ForwardRefExoticComponent<CommandPaletteChipProps & RefAttributes<HTMLSpanElement>>;
  ChipRemove: ForwardRefExoticComponent<CommandPaletteChipRemoveProps & RefAttributes<HTMLButtonElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: CommandPaletteRoot,
  Trigger: CommandPaletteTrigger,
  Backdrop: CommandPaletteBackdrop,
  Popup: CommandPalettePopup,
  Title: CommandPaletteTitle,
  Description: CommandPaletteDescription,
  Close: CommandPaletteClose,
  Content: CommandPaletteContent,
  SearchField: CommandPaletteSearchField,
  Input: CommandPaletteInput,
  ClearButton: CommandPaletteClearButton,
  ListBox: CommandPaletteListBox,
  Section: CommandPaletteSection,
  SectionHeader: CommandPaletteSectionHeader,
  Item: CommandPaletteItem,
  Separator: CommandPaletteSeparator,
  Collection: CommandPaletteCollection,
  ItemIcon: CommandPaletteItemIcon,
  ItemContent: CommandPaletteItemContent,
  ItemTitle: CommandPaletteItemTitle,
  ItemDescription: CommandPaletteItemDescription,
  ItemMeta: CommandPaletteItemMeta,
  ItemAction: CommandPaletteItemAction,
  Shortcut: CommandPaletteShortcut,
  LoadMoreItem: CommandPaletteLoadMoreItem,
  Empty: CommandPaletteEmpty,
  Footer: CommandPaletteFooter,
  Chips: CommandPaletteChips,
  Chip: CommandPaletteChip,
  ChipRemove: CommandPaletteChipRemove,
});
