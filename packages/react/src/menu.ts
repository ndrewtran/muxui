import React from 'react';
import type {
  ButtonHTMLAttributes,
  ContextType,
  ForwardRefExoticComponent,
  HTMLAttributes,
  ReactElement,
  ReactNode,
  RefAttributes,
  RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import { MenuMotion } from './menu-motion.mjs';
import { MenuSection as AriaMenuSection, MenuTrigger as AriaMenuTrigger, SubmenuTrigger as AriaSubmenuTrigger, Separator as AriaSeparator, Header as AriaHeader, PopoverContext, RootMenuTriggerStateContext, useSlottedContext } from 'react-aria-components';
import { AriaMenu, AriaMenuItem } from './substrate.ts';
import type {
  Key,
  MenuItemProps as AriaMenuItemProps,
  MenuSectionProps as AriaMenuSectionProps,
  PopoverProps as AriaPopoverProps,
} from 'react-aria-components';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import { createFocusManager } from 'react-aria/private/focus/FocusScope';
import { PopoverMotion } from './popover-motion.mjs';
import type { ButtonActivationEvent } from './button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems, collectionItem } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUIItems, NormalizedItem } from './collection-items.ts';
import { CollectionTrigger } from './collection-trigger.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';
import type { MuxUIPlacement } from './overlays.ts';

// The props each part defines, as one type per part: the catalog's web.react API is derived from them
// (Decision 0031), Menu.Root's as the family-level block and every other part's under partApis. Each is a
// type literal, so its public props type stays assignable to Record<string, unknown>, as it was before the
// move. The accessible name's arms (aria-label and aria-labelledby), children, className, and anchorRef
// stay in the public types and are not Mux UI-owned members. Menu.Header and Menu.Separator own no prop.

/** The props Mux UI defines for Menu.Root. Every other attribute of a div passes through to the root. */
export type MenuOwnProps = {
  /** Whether the menu is open, when the caller controls it. A disabled menu is closed whatever this says. */
  open?: boolean;
  /** Whether the menu starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Called with the next open state when the menu opens or closes. It is not called for a request to open a disabled menu. */
  onOpenChange?: (open: boolean) => void;
  /** Disables the trigger and every item. A child's own `disabled={false}` cannot re-enable them under a disabled root. */
  disabled?: boolean;
  /** Whether choosing an item closes the menu. A Menu.List or Menu.Item can set its own, which wins over this. */
  shouldCloseOnSelect?: boolean;
  /** Called when the user activates an item in any list of the menu, after the item's own `onAction` and the list's callbacks. A list built from `items` passes the item record; one built from children passes the identity fields `id`, `key`, and `value`. It is not called for a disabled item or while the menu is disabled. */
  onAction?: (item?: MuxUICollectionItem) => void;
  /** Called with the same item as `onAction`, right after it. */
  onSelect?: (item?: MuxUICollectionItem) => void;
};

export type MenuRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & MenuOwnProps;

/** The props Mux UI defines for Menu.Trigger. Every other attribute of a button passes through to it. */
export type MenuTriggerOwnProps = {
  /** Disables the trigger: it can be neither focused nor activated. A disabled menu disables it whatever this says. */
  disabled?: boolean | undefined;
  /** Called when the user activates the trigger, before the menu opens or closes. It is not called while the trigger is disabled. */
  onActivate?: (event: ButtonActivationEvent) => void;
};

export type MenuTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & MenuTriggerOwnProps;

/** The props Mux UI defines for Menu.Popup. Every other attribute of a div passes through to the popup. */
export type MenuPopupOwnProps = {
  /** Where the popup opens against its trigger or anchorRef. start and end follow the locale direction. Without one, a top-level popup opens at `bottom-start`, and a popup inside a Menu.Submenu opens beside its item at `end-top`. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the popup and its trigger, along the placement's side. Must be finite. */
  offset?: number;
  /** The shift in pixels along the side the popup is placed against. Must be finite. */
  crossOffset?: number;
  /** Whether the popup moves to the opposite side when the placed side has no room. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the popup and the edge of the viewport. Must be finite and not negative. */
  containerPadding?: number;
  /** Whether the rest of the page is made inaccessible while the popup is open. When false, outside content stays accessible. */
  modal?: boolean;
};

export type MenuPopupProps = HTMLAttributes<HTMLDivElement> & MenuPopupOwnProps & { anchorRef?: RefObject<Element | null> };

/** The props Mux UI defines for Menu.List, and for the standalone Menu, which is the same list. */
export type MenuListOwnProps = {
  /** The options as data: strings, or items with an `id`, a `label`, a `textValue`, and `disabled`. Children take precedence: when both are supplied, the items are not rendered. */
  items?: MuxUIItems;
  /** Disables every item and stops the action callbacks. An item's own `disabled={false}` cannot re-enable it under a disabled list. */
  disabled?: boolean;
  /** Whether choosing an item closes the menu, in place of the root's setting. A Menu.Item can still set its own. */
  shouldCloseOnSelect?: boolean;
  /** Called when the user activates an item. A list built from `items` passes the item record; one built from children passes the identity fields `id`, `key`, and `value`. It is not called for a disabled item or while the list is disabled. */
  onAction?: (item?: MuxUICollectionItem) => void;
  /** Called with the same item as `onAction`, right after it. */
  onSelect?: (item?: MuxUICollectionItem) => void;
};

export type MenuProps = MenuListOwnProps & { children?: ReactNode; className?: string } & MuxUIAriaAccessibleName;

export type MenuListProps = MenuListOwnProps & { children?: ReactNode; className?: string } & { 'aria-label'?: string; 'aria-labelledby'?: string };

/** The props Mux UI defines for Menu.Item. Every other attribute of a div passes through to the item. */
export type MenuItemOwnProps = {
  /** The stable string id the action callbacks report. */
  id: string;
  /** The text typeahead matches. Without one it is the text of the item's children, which is unambiguous only for plain text, so give rich children a `textValue`. */
  textValue?: string;
  /** Disables the item. A disabled list or menu disables every item whatever this says. */
  disabled?: boolean;
  /** Called when the user activates the item, before the list's and the root's callbacks. It is not called while the item is disabled. */
  onAction?: () => void;
  /** Whether choosing this item closes the menu, in place of the list's and the root's setting. Left unset, the item follows them. */
  shouldCloseOnSelect?: boolean;
};

export type MenuItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & MenuItemOwnProps;

/** The props Mux UI defines for Menu.Section. Every other attribute of a section passes through to it. */
export type MenuSectionOwnProps = {
  /** The visible heading of the section, rendered in a Menu.Header. Without one, name the section with `aria-label`. */
  title?: ReactNode;
};

export type MenuSectionProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & MenuSectionOwnProps;

/** The props Mux UI defines for Menu.Submenu, which renders no element of its own. */
export type MenuSubmenuOwnProps = {
  /** How long in milliseconds the pointer rests on the submenu's item before the submenu opens. Must be finite and not negative. */
  delay?: number;
};

export type MenuSubmenuProps = MenuSubmenuOwnProps & { children: ReactNode };

// A forwardRef result carries no statics, so the compound states them.
type MenuComponent = ForwardRefExoticComponent<MenuProps & RefAttributes<HTMLDivElement>> & {
  Root: ForwardRefExoticComponent<MenuRootProps & RefAttributes<HTMLDivElement>>;
  Trigger: ForwardRefExoticComponent<MenuTriggerProps & RefAttributes<HTMLButtonElement>>;
  Popup: ForwardRefExoticComponent<MenuPopupProps & RefAttributes<HTMLDivElement>>;
  List: ForwardRefExoticComponent<MenuListProps & RefAttributes<HTMLDivElement>>;
  Item: ForwardRefExoticComponent<MenuItemProps & RefAttributes<HTMLDivElement>>;
  Submenu: (props: MenuSubmenuProps) => ReactElement;
  Section: ForwardRefExoticComponent<MenuSectionProps & RefAttributes<HTMLElement>>;
  Header: ForwardRefExoticComponent<HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>>;
  Separator: ForwardRefExoticComponent<HTMLAttributes<HTMLHRElement> & RefAttributes<HTMLHRElement>>;
};

// Menu.List takes one prop beyond the public ones: the standalone Menu renders it without the popup class.
type MenuListInnerProps = MenuListProps & { standalone?: boolean };

interface MenuContextValue {
  disabled: boolean;
  shouldCloseOnSelect?: boolean | undefined;
  onAction?: ((item?: MuxUICollectionItem) => void) | undefined;
  onSelect?: ((item?: MuxUICollectionItem) => void) | undefined;
}

const useMenuLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// The geometry a popup falls back to, bar its placement, which depends on whether a submenu holds it. A parameter
// default and the geometry helper's fallback both read this record, so the default a block states is the one that runs.
const MENU_POPUP_GEOMETRY = Object.freeze({ offset: 4, crossOffset: 0, shouldFlip: true, containerPadding: 12 } as const);

const MenuContext = React.createContext<MenuContextValue>({ disabled: false });
// The element a popup is anchored to, for the list inside it.
const MenuAnchorContext = React.createContext<RefObject<Element | null> | null>(null);

// Tab leaves an open menu: the whole menu tree closes, which makes the rest of the page interactive again, and focus goes to
// the first of `origins` that is still in the page and takes it (the trigger, else the element focused as the menu opened,
// else its anchor). The browser then moves on from there by its own rules, so Tab's default action is left alone.
function leaveMenuOnTab(menuTrigger: NonNullable<ContextType<typeof RootMenuTriggerStateContext>>, origins: (Element | null | undefined)[], shiftKey: boolean) {
  flushSync(() => menuTrigger.close());
  for (const origin of origins) {
    if (!origin?.isConnected || origin === origin.ownerDocument.body) continue;
    // Any element React Aria hands focus to here takes it, an SVG one included.
    (origin as HTMLElement).focus({ preventScroll: true });
    // A Toolbar may hand focus on to the control it last held, so focus anywhere in it counts.
    const toolbar = origin.closest('[role="toolbar"]');
    const focused = origin.ownerDocument.activeElement;
    if (focused !== origin && !toolbar?.contains(focused)) continue;
    // A Toolbar sends Tab out of itself by focusing its last control (first for Shift+Tab) before the default action, but
    // it ignores keys from a portalled menu, so the menu does the same.
    if (toolbar) {
      const toolbarFocus = createFocusManager({ current: toolbar });
      if (shiftKey) toolbarFocus.focusFirst();
      else toolbarFocus.focusLast();
    }
    return;
  }
}

function MenuSubmenu({ children, delay = 200 }: MenuSubmenuProps): ReactElement {
  if (!Number.isFinite(delay) || delay < 0) throw new TypeError('Menu.Submenu delay must be a nonnegative finite number');
  const pair = React.Children.toArray(children);
  if (pair.length !== 2 || !pair.every(React.isValidElement)) throw new TypeError('Menu.Submenu requires an item and a popup');
  return React.createElement(AriaSubmenuTrigger, { delay, children: pair });
}

export const Menu: MenuComponent = /*#__PURE__*/ (() => {
  const Menu = React.forwardRef<HTMLDivElement, MenuProps>(function Menu(props, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Menu');
    return React.createElement(MenuList, { ...props, ref, standalone: true });
  }) as MenuComponent;
  Menu.displayName = 'Menu';

  const MenuRoot = React.forwardRef<HTMLDivElement, MenuRootProps>(function MenuRoot({ open, defaultOpen = false, onOpenChange, onAction, onSelect, disabled = false, shouldCloseOnSelect = true, className, children, ...props }, ref) {
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    // Conditionals, not ?? and || on the owned props: extraction reads a fallback on an owned prop as an executed default.
    const currentOpen = !disabled && (open == null ? internalOpen : open);
    const setOpen = (next: boolean) => {
      if (disabled && next) return;
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    };
    const context: MenuContextValue = { disabled, shouldCloseOnSelect, onAction, onSelect };
    return React.createElement(MenuContext.Provider, { value: context },
      React.createElement(AriaMenuTrigger, {
        isOpen: currentOpen,
        onOpenChange: setOpen,
        children: React.createElement('div', { ...props, ref, className: classNames('muxui-menu__root', className), 'data-muxui-state-open': currentOpen || undefined, 'data-muxui-state-disabled': disabled ? disabled : undefined }, children),
      }));
  });

  const MenuTrigger = React.forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger({ disabled = false, onActivate, className, children, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, onActivate, className: classNames('muxui-menu__trigger', className) }, children);
  });

  const MenuPopup = /*#__PURE__*/ React.forwardRef<HTMLDivElement, MenuPopupProps>(function MenuPopup({ children, placement, offset = MENU_POPUP_GEOMETRY.offset, crossOffset = MENU_POPUP_GEOMETRY.crossOffset, shouldFlip = MENU_POPUP_GEOMETRY.shouldFlip, containerPadding = MENU_POPUP_GEOMETRY.containerPadding, anchorRef, modal = true, className, ...props }, ref) {
    // The placement has no default of its own to state: a top-level popup falls back to bottom-start, and a popup in a submenu to none, so the
    // placement React Aria gives a submenu, beside its item (end top), applies. React Aria renders that popup outside Menu.Submenu's React
    // subtree, so only its PopoverContext, which names the trigger, says the popup is nested; it is read through the popup's own slot, as
    // React Aria reads it. A SubmenuTrigger marker a consumer puts directly around a popup reads as nested too, and Menu.Root replaces any outside it.
    const nested = useSlottedContext(PopoverContext, props.slot)?.trigger === 'SubmenuTrigger';
    const { placement: validPlacement, ...geometry } = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, { ...MENU_POPUP_GEOMETRY, placement: 'bottom-start' }, 'Menu.Popup');
    return React.createElement(PopoverMotion, { ...(props as AriaPopoverProps), ...geometry, placement: nested && placement === undefined ? undefined : validPlacement, ref, triggerRef: anchorRef, isNonModal: !normalizeBoolean(modal, true, 'Menu.Popup modal'), className: classNames('muxui-menu__popup', className) },
      React.createElement(MenuAnchorContext.Provider, { value: anchorRef ?? null }, children));
  });

  const MenuList = React.forwardRef<HTMLDivElement, MenuListInnerProps>(function MenuList({ items, children, disabled = false, shouldCloseOnSelect, onAction, onSelect, className, standalone = false, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = context.disabled || disabled;
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    const disabledKeys = new Set(normalized.filter((item) => effectiveDisabled || item.disabled).map((item) => item.id));
    // Tab leaves an open menu, as it does for a menu button. Only the root list handles it, since a submenu's Tab bubbles
    // to it through the React tree.
    const popover = React.useContext(PopoverContext) as AriaPopoverProps | null;
    const menuTrigger = React.useContext(RootMenuTriggerStateContext);
    const anchorRef = React.useContext(MenuAnchorContext);
    // A menu with no trigger button, opened from another control, gives focus back to that control: the one focused as each
    // opening starts, before focus moves into the menu. The list stays mounted while the menu exits, so this follows the
    // open state, not the mount; focus already inside a menu popup is the menu's own, as when StrictMode replays the effect
    // after focus moved in, so it never replaces the opener.
    const opener = React.useRef<Element | null>(null);
    const menuOpen = menuTrigger?.isOpen ?? false;
    useMenuLayoutEffect(() => {
      if (!menuOpen) opener.current = null;
      else if (!document.activeElement?.closest('.muxui-menu__popup')) opener.current = document.activeElement;
    }, [menuOpen]);
    const menu = React.createElement(AriaMenu<NormalizedItem>, {
      ...props,
      // The list's own Tab handling moves focus back into the list, so the handler must run after it, which `render` allows.
      // React Aria's MenuTrigger provides both the popover's trigger and the menu's state for as long as the popover reports one.
      render: popover?.trigger === 'MenuTrigger' ? (domProps) => React.createElement('div', {
        ...domProps,
        onKeyDown: (event) => {
          domProps.onKeyDown?.(event);
          if (event.key === 'Tab') leaveMenuOnTab(menuTrigger!, [popover.triggerRef!.current, opener.current, anchorRef?.current], event.shiftKey);
        },
      }) : undefined,
      items: hasChildren ? undefined : normalized,
      disabledKeys,
      // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and the root's setting is the next fallback.
      shouldCloseOnSelect: shouldCloseOnSelect == null ? (context.shouldCloseOnSelect ?? true) : shouldCloseOnSelect,
      onAction: (key: Key) => {
        const item = normalized.find((candidate) => candidate.id === String(key)) ?? collectionItem(key);
        if (!effectiveDisabled && !item.disabled) {
          onAction?.(item);
          onSelect?.(item);
          context.onAction?.(item);
          context.onSelect?.(item);
        }
      },
      // React Aria's props do not name aria-disabled or the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-muxui-state-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined },
      className: classNames(standalone ? 'muxui-menu' : 'muxui-menu muxui-menu__list', className),
      children: hasChildren ? children : (item: NormalizedItem) => React.createElement(MenuItem, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label),
    });
    return React.createElement(MenuContext.Provider, { value: { ...context, disabled: effectiveDisabled } },
      React.createElement(MenuMotion, { rootRef: ref, children: menu }));
  });

  const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(function MenuItem({ children, id, textValue, disabled = false, className, onAction, shouldCloseOnSelect, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(AriaMenuItem, {
      ...(props as AriaMenuItemProps), ref, id,
      // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and the item's own text is none.
      textValue: textValue == null ? (textContent(children) || undefined) : textValue,
      isDisabled: effectiveDisabled,
      // Forwarded as given: left unset, React Aria applies the menu's setting.
      shouldCloseOnSelect,
      onAction: onAction ? () => { if (!effectiveDisabled) onAction(); } : undefined,
      ...{ 'data-muxui-state-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined },
      className: classNames('muxui-menu__item', className),
    }, children);
  });

  const MenuSection = React.forwardRef<HTMLElement, MenuSectionProps>(function MenuSection({ children, title, className, ...props }, ref) {
    return React.createElement(AriaMenuSection, { ...(props as AriaMenuSectionProps<unknown>), ref, className: classNames('muxui-menu__section', className) },
      title !== undefined ? React.createElement(MenuHeader, null, title) : null, children);
  });

  const MenuHeader = React.forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function MenuHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-menu__header', className) }, children);
  });

  const MenuSeparator = React.forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(function MenuSeparator({ className, ...props }, ref) {
    return React.createElement(AriaSeparator, { ...props, ref, elementType: 'hr', className: classNames('muxui-menu__separator', className) });
  });

  Menu.Root = MenuRoot;
  Menu.Trigger = MenuTrigger;
  Menu.Popup = MenuPopup;
  Menu.List = MenuList;
  Menu.Item = MenuItem;
  Menu.Submenu = MenuSubmenu;
  Menu.Section = MenuSection;
  Menu.Header = MenuHeader;
  Menu.Separator = MenuSeparator;
  return Menu;
})();
