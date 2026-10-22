import React from 'react';
import { flushSync } from 'react-dom';
import { MenuMotion } from './menu-motion.mjs';
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger as AriaMenuTrigger,
  SubmenuTrigger as AriaSubmenuTrigger,
  Separator as AriaSeparator,
  Header as AriaHeader,
  PopoverContext,
  RootMenuTriggerStateContext,
} from 'react-aria-components';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import { createFocusManager } from 'react-aria/private/focus/FocusScope';
import { PopoverMotion } from './popover-motion.mjs';
import { classNames, accessibleName } from './control-utils.mjs';
import { textContent, normalizeItems, collectionItem } from './collection-items.mjs';
import { CollectionTrigger } from './collection-trigger.mjs';

const useMenuLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// Tab leaves an open menu: the whole menu tree closes, which makes the rest of the page interactive again, and focus goes to
// the first of `origins` that is still in the page and takes it (the trigger, else the element focused as the menu opened,
// else its anchor). The browser then moves on from there by its own rules, so Tab's default action is left alone.
function leaveMenuOnTab(menuTrigger, origins, shiftKey) {
  flushSync(() => menuTrigger.close());
  for (const origin of origins) {
    if (!origin?.isConnected || origin === origin.ownerDocument.body) continue;
    origin.focus({ preventScroll: true });
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

export const Menu = /*#__PURE__*/ (() => {
  const Menu = React.forwardRef(function Menu(props, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Menu');
    return React.createElement(MenuList, { ...props, ref, standalone: true });
  });
  Menu.displayName = 'Menu';

  const MenuContext = React.createContext({ disabled: false });
  const MenuSubmenuContext = React.createContext(false);
  // The element a popup is anchored to, for the list inside it.
  const MenuAnchorContext = React.createContext(null);

  const MenuRoot = React.forwardRef(function MenuRoot({ open, defaultOpen = false, onOpenChange, onAction, onSelect, disabled = false, shouldCloseOnSelect = true, className, children, ...props }, ref) {
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const currentOpen = !disabled && (open ?? internalOpen);
    const setOpen = (next) => {
      if (disabled && next) return;
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    };
    const context = { disabled, shouldCloseOnSelect, onAction, onSelect };
    return React.createElement(MenuContext.Provider, { value: context },
      React.createElement(MenuSubmenuContext.Provider, { value: false },
        React.createElement(AriaMenuTrigger, { isOpen: currentOpen, onOpenChange: setOpen },
          React.createElement('div', { ...props, ref, className: classNames('muxui-menu-root', className), 'data-open': currentOpen || undefined, 'data-disabled': disabled || undefined }, children))));
  });

  const MenuTrigger = React.forwardRef(function MenuTrigger({ disabled = false, onActivate, className, children, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, onActivate, className: classNames('muxui-menu-trigger', className) }, children);
  });

  const MenuPopup = /*#__PURE__*/ React.forwardRef(function MenuPopup({ children, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, className, ...props }, ref) {
    const submenu = React.useContext(MenuSubmenuContext);
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, { placement: submenu ? 'end-top' : 'bottom-start', offset: 4, crossOffset: 0, shouldFlip: true, containerPadding: 12 }, 'Menu.Popup');
    return React.createElement(PopoverMotion, { ...props, ...geometry, ref, triggerRef: anchorRef, isNonModal: !normalizeBoolean(modal, true, 'Menu.Popup modal'), className: classNames('muxui-menu-popup', className) },
      React.createElement(MenuAnchorContext.Provider, { value: anchorRef ?? null }, children));
  });

  const MenuList = React.forwardRef(function MenuList({ items = [], children, disabled = false, shouldCloseOnSelect, onAction, onSelect, className, standalone = false, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = context.disabled || disabled;
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    const disabledKeys = new Set(normalized.filter((item) => effectiveDisabled || item.disabled).map((item) => item.id));
    // Tab leaves an open menu, as it does for a menu button. Only the root list handles it, since a submenu's Tab bubbles
    // to it through the React tree.
    const popover = React.useContext(PopoverContext);
    const menuTrigger = React.useContext(RootMenuTriggerStateContext);
    const anchorRef = React.useContext(MenuAnchorContext);
    // A menu with no trigger button, opened from another control, gives focus back to that control: the one focused as each
    // opening starts, before focus moves into the menu. The list stays mounted while the menu exits, so this follows the
    // open state, not the mount; focus already inside a menu popup is the menu's own, as when StrictMode replays the effect
    // after focus moved in, so it never replaces the opener.
    const opener = React.useRef(null);
    const menuOpen = menuTrigger?.isOpen ?? false;
    useMenuLayoutEffect(() => {
      if (!menuOpen) opener.current = null;
      else if (!document.activeElement?.closest('.muxui-menu-popup')) opener.current = document.activeElement;
    }, [menuOpen]);
    const menu = React.createElement(AriaMenu, {
      ...props,
      // The list's own Tab handling moves focus back into the list, so the handler must run after it, which `render` allows.
      render: popover?.trigger === 'MenuTrigger' ? (domProps) => React.createElement('div', {
        ...domProps,
        onKeyDown: (event) => {
          domProps.onKeyDown?.(event);
          if (event.key === 'Tab') leaveMenuOnTab(menuTrigger, [popover.triggerRef.current, opener.current, anchorRef?.current], event.shiftKey);
        },
      }) : undefined,
      items: hasChildren ? undefined : normalized,
      disabledKeys,
      shouldCloseOnSelect: shouldCloseOnSelect ?? context.shouldCloseOnSelect ?? true,
      onAction: (key) => {
        const item = normalized.find((candidate) => candidate.id === String(key)) ?? collectionItem(key);
        if (!effectiveDisabled && !item.disabled) {
          onAction?.(item);
          onSelect?.(item);
          context.onAction?.(item);
          context.onSelect?.(item);
        }
      },
      'data-disabled': effectiveDisabled || undefined,
      'aria-disabled': effectiveDisabled || undefined,
      className: classNames(standalone ? 'muxui-menu' : 'muxui-menu muxui-menu-list', className),
    }, hasChildren ? children : (item) => React.createElement(MenuItem, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    return React.createElement(MenuContext.Provider, { value: { ...context, disabled: effectiveDisabled } },
      React.createElement(MenuMotion, { rootRef: ref }, menu));
  });

  const MenuItem = React.forwardRef(function MenuItem({ children, id, textValue, disabled = false, className, onAction, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaMenuItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, onAction: onAction ? () => { if (!effectiveDisabled) onAction(); } : undefined, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-menu-item', className) }, children);
  });

  const MenuSection = React.forwardRef(function MenuSection({ children, title, className, ...props }, ref) {
    return React.createElement(AriaMenuSection, { ...props, ref, className: classNames('muxui-menu-section', className) },
      title !== undefined ? React.createElement(MenuHeader, null, title) : null, children);
  });

  const MenuHeader = React.forwardRef(function MenuHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-menu-section-header', className) }, children);
  });

  const MenuSeparator = React.forwardRef(function MenuSeparator({ className, ...props }, ref) {
    return React.createElement(AriaSeparator, { ...props, ref, elementType: 'hr', className: classNames('muxui-menu-separator', className) });
  });

  function MenuSubmenu({ children, delay = 200 }) {
    if (!Number.isFinite(delay) || delay < 0) throw new TypeError('Menu.Submenu delay must be a nonnegative finite number');
    const pair = React.Children.toArray(children);
    if (pair.length !== 2 || !pair.every(React.isValidElement)) throw new TypeError('Menu.Submenu requires an item and a popup');
    return React.createElement(MenuSubmenuContext.Provider, { value: true }, React.createElement(AriaSubmenuTrigger, { delay }, pair));
  }

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
