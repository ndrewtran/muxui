import React from 'react';
import { flushSync } from 'react-dom';
import { TreeMotion } from './tree-motion.mjs';
import { GridListMotion } from './grid-list-motion.mjs';
import { MenuMotion } from './menu-motion.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import {
  ComboBox as AriaComboBox,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger as AriaMenuTrigger,
  SubmenuTrigger as AriaSubmenuTrigger,
  Separator as AriaSeparator,
  Header as AriaHeader,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Column as AriaColumn,
  Row as AriaRow,
  Cell as AriaCell,
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanels as AriaTabPanels,
  TabPanel as AriaTabPanel,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Tag as AriaTag,
  ToggleButtonGroup as AriaToggleButtonGroup,
  TokenField as AriaTokenField,
  TokenInput as AriaTokenInput,
  Token as AriaToken,
  Toolbar as AriaToolbar,
  Virtualizer as AriaVirtualizer,
  ListLayout,
  GridLayout,
  Size,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  Group as AriaGroup,
  TreeItemContent as AriaTreeItemContent,
  Label as AriaLabel,
  Input as AriaInput,
  Text as AriaText,
  FieldError as AriaFieldError,
  TokenFieldValue,
  PopoverContext,
  RootMenuTriggerStateContext,
} from 'react-aria-components';
import { normalizeToggleButtonSize, ToggleButtonSizeContext } from './toggle-button-context.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { GridListItemDisabledContext } from './grid-list-item-context.mjs';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import { createFocusManager } from 'react-aria/private/focus/FocusScope';
import { PopoverMotion } from './popover-motion.mjs';
import { RadioGroupMotion, RadioMotionIndicator } from './radio-motion.mjs';
import { SliderMotionTrack } from './slider-motion.mjs';
import { TabsMotion } from './tabs-motion.mjs';
import { ToggleButtonGroupMotion } from './toggle-button-group-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.mjs';
import { textContent, normalizeItems, keySet, keyList, collectionItem } from './collection-items.mjs';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.mjs';
import { CollectionTrigger } from './collection-trigger.mjs';
import { GridVirtualizerContext } from './grid-virtualizer-context.mjs';

export { Calendar, RangeCalendar } from './calendar.mjs';
export { ColorSwatch } from './color-swatch.mjs';
export { ColorField } from './color-field.mjs';
export { ColorArea } from './color-area.mjs';
export { ColorSlider } from './color-slider.mjs';
export { ColorWheel } from './color-wheel.mjs';
export { ColorPicker } from './color-picker.mjs';
export { ColorSwatchPicker } from './color-swatch-picker.mjs';
export { ListBox } from './list-box.mjs';

const TABS_VARIANTS = new Set(['underline', 'pill', 'overflow', 'segment']);
const TAG_VARIANTS = ['soft', 'outline', 'dot', 'strong'];
const TAG_COLORS = [
  'neutral', 'brand', 'success', 'warning', 'error',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'bluegreen', 'cyan', 'sky', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

function normalizeTabsVariant(value = 'underline') {
  if (!TABS_VARIANTS.has(value)) {
    throw new TypeError('Tabs variant must be one of: underline, pill, overflow, segment');
  }
  return value;
}

function normalizeTagOption(name, options, value) {
  if (!options.includes(value)) throw new TypeError(`TagGroup ${name} must be one of: ${options.join(', ')}`);
  return value;
}

function readonlyKeyArray(value, property) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${property} must be a readonly string array`);
  }
  return [...value];
}

function readonlyKeySet(value, property, selectionMode) {
  if (selectionMode !== 'single' && selectionMode !== 'multiple') {
    throw new TypeError('ToggleButtonGroup selectionMode must be single or multiple');
  }
  const keys = readonlyKeyArray(value, property);
  if (keys && selectionMode === 'single' && keys.length > 1) {
    throw new TypeError(`${property} must contain at most one ID in single selection mode`);
  }
  return keys === undefined ? undefined : new Set(keys);
}

function collectionProps(props, componentName) {
  const { items = [], selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children: _children, className, ...rest } = props;
  const normalized = normalizeItems(items);
  accessibleName({ ariaLabel: rest['aria-label'], ariaLabelledby: rest['aria-labelledby'] }, componentName);
  const disabledKeys = disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
  return { normalized, rest, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onAction, selectionMode, className: classNames(`muxui-${componentName}`, className), disabled, disabledKeys };
}

const GridListContext = React.createContext({ disabled: false });

const useVirtualizedLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// Computed lengths resolve to px, including clamp() and viewport-unit tokens. A
// percentage or `normal` is not a length, so it counts as no gap.
function gapPixels(value) {
  const pixels = Number.parseFloat(value);
  return value.endsWith('px') && Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
}

// Reports the root's resolved column and row gap on mount, whenever the root
// resizes, and on window resize, since a fluid gap follows the viewport.
function useVirtualizedGap(root, reportGap) {
  useVirtualizedLayoutEffect(() => {
    if (!root || !reportGap) return undefined;
    const view = root.ownerDocument.defaultView;
    const read = () => {
      const style = view.getComputedStyle(root);
      reportGap({ column: gapPixels(style.columnGap), row: gapPixels(style.rowGap) });
    };
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(root);
    view.addEventListener('resize', read);
    return () => {
      observer?.disconnect();
      view.removeEventListener('resize', read);
    };
  }, [root, reportGap]);
}

// RAC scrolls a keyboard-focused row into view once, against estimated row sizes.
// Measured sizes, and scrolling that lands after RAC's own, then move that row: a
// Home press after End can end up back at the old position. So for a second after
// a navigation key press, once focus has left the item it was on, keep revealing the
// focused row whenever the content resizes or the view scrolls. Other keys never
// start that window, and a wheel, touch, or pointer press ends it at once, so the
// reveal never pulls the view back from where the user scrolled. The origin is an
// item key, not a node: the Virtualizer recycles row nodes, so after a jump key the
// newly focused item can render into the node the origin item had.
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const REVEAL_WINDOW_MS = 1000;

function useVirtualizedFocusReveal(root, enabled) {
  useVirtualizedLayoutEffect(() => {
    if (!root || !enabled || typeof ResizeObserver === 'undefined') return undefined;
    const doc = root.ownerDocument;
    let armedUntil = 0;
    let originKey = null;
    let content = null;
    let contentSize = '';
    const focusedRow = () => doc.activeElement?.closest('[role="row"]') ?? null;
    // RAC sets data-key on every row.
    const keyOf = (row) => row?.getAttribute('data-key') ?? null;
    const sizeOf = (node) => {
      const { width, height } = node.getBoundingClientRect();
      return `${width}x${height}`;
    };
    // Scrolling an already visible row is a no-op, so revealing is safe to repeat.
    const reveal = () => {
      const row = focusedRow();
      if (performance.now() < armedUntil && row && keyOf(row) !== originKey && root.contains(row)) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    // A ResizeObserver also reports once as soon as it observes, with nothing resized.
    // Comparing sizes keeps that report, and any other unchanged one, from revealing.
    const onResize = () => {
      const size = sizeOf(content);
      if (size === contentSize) return;
      contentSize = size;
      reveal();
    };
    const observer = new ResizeObserver(onResize);
    const onKeyDown = (event) => {
      if (!NAVIGATION_KEYS.has(event.key)) return;
      if (content !== root.firstElementChild) {
        content = root.firstElementChild;
        observer.disconnect();
        if (content) observer.observe(content);
      }
      if (content) contentSize = sizeOf(content);
      originKey = keyOf(focusedRow());
      armedUntil = performance.now() + REVEAL_WINDOW_MS;
    };
    // The root scrolls itself when bounded, and the document scrolls it when not.
    const onScroll = (event) => {
      if (event.target === root || event.target === doc) reveal();
    };
    const disarm = () => { armedUntil = 0; };
    // The document sees every wheel, touch, and press on the root, and also a scrollbar
    // drag that scrolls the page around an unbounded root.
    const disarming = ['wheel', 'touchstart', 'pointerdown'];
    root.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    for (const type of disarming) doc.addEventListener(type, disarm, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('scroll', onScroll, { capture: true });
      for (const type of disarming) doc.removeEventListener(type, disarm, { capture: true });
    };
  }, [root, enabled]);
}

export const GridList = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function GridList({ children, style, layout = 'stack', orientation = 'vertical', ...props }, ref) {
    const { normalized, rest, selectedKeys, defaultSelectedKeys, onSelectionChange, onAction, selectionMode, className, disabled, disabledKeys } = collectionProps(props, 'grid-list');
    const reportGap = React.useContext(GridVirtualizerContext);
    const [gapRoot, setGapRoot] = React.useState(null);
    useVirtualizedGap(gapRoot, reportGap);
    useVirtualizedFocusReveal(gapRoot, reportGap !== null);
    const gapRef = React.useCallback((node) => {
      setGapRoot(node);
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
      return undefined;
    }, [ref]);
    if (layout !== 'stack' && layout !== 'grid') throw new TypeError('GridList layout must be stack or grid');
    if (orientation !== 'vertical' && orientation !== 'horizontal') throw new TypeError('GridList orientation must be vertical or horizontal');
    const virtualized = reportGap !== null;
    if (virtualized && (layout !== 'grid' || orientation !== 'vertical')) throw new TypeError('GridList inside a grid Virtualizer must use layout="grid" and the vertical orientation');
    const hasChildren = children !== undefined && children !== null;
    const gridList = React.createElement(AriaGridList, {
      ...rest,
      items: hasChildren ? undefined : normalized,
      selectionMode,
      selectedKeys,
      defaultSelectedKeys,
      disabledKeys,
      onSelectionChange,
      // A RAC action handler turns presses into actions while nothing is
      // selected, so only consumer actions may suppress press selection.
      ...(onAction ? {
        onAction: (key) => {
          const item = normalized.find((candidate) => candidate.id === String(key));
          if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
        },
      } : {}),
      isDisabled: disabled,
      'aria-disabled': disabled || undefined,
      layout,
      orientation,
      // RAC already forces tab navigation in the grid layout. A horizontal stack
      // needs it too: the default arrow behavior spends Left and Right on nested
      // controls, so they could never move between items.
      keyboardNavigationBehavior: orientation === 'horizontal' ? 'tab' : 'arrow',
      'data-muxui-virtualized': virtualized || undefined,
      style,
      className,
    }, hasChildren ? children : (item) => React.createElement(component.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    // Only this list's own root reports its gap, so a GridList nested in an item stays a plain list.
    return React.createElement(GridListContext.Provider, { value: { disabled } },
      React.createElement(GridVirtualizerContext.Provider, { value: null },
        React.createElement(GridListMotion, { rootRef: virtualized ? gapRef : ref }, gridList)));
  });
  component.displayName = 'GridList';
  component.Item = React.forwardRef(function GridListItem({ children, id, textValue, disabled = false, className, style }, ref) {
    const context = React.useContext(GridListContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaGridListItem, {
      ref, id, style,
      textValue: textValue ?? (textContent(children) || undefined),
      isDisabled: effectiveDisabled,
      'data-disabled': effectiveDisabled || undefined,
      'aria-disabled': effectiveDisabled || undefined,
      className: classNames('muxui-grid-list-item', className),
    }, React.createElement(GridListItemDisabledContext.Provider, { value: effectiveDisabled }, children));
  });
  return component;
})();

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

export const ComboBox = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function ComboBox({ label, description, errorMessage, items = [], value, defaultValue, selectedId, defaultSelectedId, onChange, onSelect, disabled = false, readOnly = false, required = false, invalid = false, placeholder, size, name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ComboBox');
    if (selectedId === '') throw new TypeError('ComboBox selectedId must be an item id, or null for no selection; an empty string is not an id');
    if (defaultSelectedId === '') throw new TypeError('ComboBox defaultSelectedId must be an item id; omit it for no selection');
    const resolvedSize = normalizeChoiceControlSize(size, 'ComboBox');
    const normalized = normalizeItems(items);
    const disabledKeys = new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
    // React Aria reports a cleared selection as a null key, except when both the text and the
    // selection are controlled: then the application owns both, so the clear is read from the emptied input.
    const bothControlled = value !== undefined && selectedId !== undefined;
    const handleSelection = (key) => {
      if (disabled || readOnly) return;
      if (key == null) {
        if (!bothControlled) onSelect?.(undefined);
        return;
      }
      const item = normalized.find((candidate) => candidate.id === String(key));
      if (item && !item.disabled) onSelect?.(item);
    };
    const handleInput = (next) => {
      if (disabled || readOnly) return;
      onChange?.(next);
      if (bothControlled && next === '' && selectedId !== null) onSelect?.(undefined);
    };
    // defaultItems lets React Aria filter options by the typed text; items would mean consumer-filtered.
    return React.createElement(AriaComboBox, { ...props, ref, defaultItems: normalized, disabledKeys, ...(value === undefined ? {} : { inputValue: value }), defaultInputValue: defaultValue, selectedKey: selectedId, defaultSelectedKey: defaultSelectedId, onInputChange: handleInput, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, name, className: classNames('muxui-combo-box', className), 'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(AriaGroup, { className: 'muxui-combo-control' },
        React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
        React.createElement(IconButton, { className: 'muxui-combo-box-trigger', 'aria-label': 'Show options' },
          React.createElement(ChevronDownIcon, { className: 'muxui-combo-box-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
      description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
      errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
      React.createElement(PopoverMotion, { className: 'muxui-combo-box-popover', 'data-size': resolvedSize }, React.createElement(AriaListBox, { items: normalized, className: 'muxui-combo-box-list', 'data-size': resolvedSize }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, isDisabled: item.disabled, 'data-disabled': item.disabled || undefined, 'aria-disabled': item.disabled || undefined, className: 'muxui-combo-box-option' }, item.label))),
    );
  });
  component.displayName = 'ComboBox';
  return component;
})();

const SelectContext = React.createContext({ disabled: false });

function selectChildrenProvideLabel(children) {
  return React.Children.toArray(children).some((child) => React.isValidElement(child)
    && (child.type === Select.Label
      ? Boolean(textContent(child.props.children).trim())
      : selectChildrenProvideLabel(child.props.children)));
}

export const Select = /*#__PURE__*/ (() => {
  const Select = React.forwardRef(function SelectRoot({ label, description, errorMessage, items = [], value, defaultValue, open, defaultOpen = false, onOpenChange, onChange, disabled = false, readOnly = false, required = false, invalid = false, placeholder = 'Select an option', selectedContent, trigger, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, size, name, children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    if (!selectChildrenProvideLabel(children)) accessibleName({ label, ariaLabel, ariaLabelledby }, 'Select');
    if (trigger !== undefined && (!React.isValidElement(trigger) || trigger.type !== 'button')) throw new TypeError('Select trigger must be a native button element');
    const resolvedSize = normalizeChoiceControlSize(size, 'Select');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, { placement: 'bottom-start', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12 }, 'Select');
    const isModal = normalizeBoolean(modal, true, 'Select modal');
    const [internalSelectedKey, setInternalSelectedKey] = React.useState(defaultValue ?? null);
    const handleSelection = (key) => {
      if (disabled || readOnly) return;
      const next = key == null ? null : String(key);
      if (value === undefined) setInternalSelectedKey(next);
      onChange?.(next ?? undefined);
    };
    const selectContext = { disabled, readOnly, resolvedSize, geometry, anchorRef, modal: isModal };
    const defaultChildren = React.createElement(React.Fragment, null,
      trigger ? React.createElement(Select.Trigger, { ...trigger.props, disabled: disabled || trigger.props.disabled })
        : React.createElement(Select.Trigger, null,
          React.createElement(Select.Value, null, selectedContent ?? (({ selectedText }) => selectedText || placeholder)),
          React.createElement(ChevronDownIcon, { className: 'muxui-select-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 })),
      React.createElement(Select.Popup, null, React.createElement(Select.List, { items })));
    return React.createElement(SelectContext.Provider, { value: selectContext },
      React.createElement(AriaSelect, {
        ...props, ref, selectedKey: value !== undefined ? value : internalSelectedKey,
        isOpen: disabled ? false : open, defaultOpen: !disabled && defaultOpen,
        onOpenChange: (next) => { if (!disabled || !next) onOpenChange?.(next); },
        onSelectionChange: handleSelection, isDisabled: disabled, isRequired: required,
        isInvalid: invalid || undefined, name, placeholder,
        'data-readonly': readOnly || undefined, className: classNames('muxui-select', className),
        'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
      },
      label !== undefined ? React.createElement(Select.Label, null, label) : null,
      children ?? defaultChildren,
      description !== undefined ? React.createElement(Select.Description, null, description) : null,
      errorMessage !== undefined ? React.createElement(Select.Error, null, errorMessage) : null));
  });
  Select.displayName = 'Select';

  Select.Root = Select;
  Select.Label = React.forwardRef(function SelectLabel({ children, className, ...props }, ref) {
    return React.createElement(AriaLabel, { ...props, ref, elementType: 'span', className: classNames('muxui-field-label muxui-select-label', className) }, children);
  });
  Select.Trigger = React.forwardRef(function SelectTrigger({ children, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, className: classNames('muxui-select-trigger', className) }, children);
  });
  Select.Value = React.forwardRef(function SelectValue({ children, className, ...props }, ref) {
    return React.createElement(AriaSelectValue, { ...props, ref, className: classNames('muxui-select-value', className) }, children);
  });
  Select.Popup = React.forwardRef(function SelectPopup({ children, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const defaults = { placement: 'bottom-start', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12, ...context.geometry };
    defaults.placement = defaults.placement.replace(' ', '-');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, defaults, 'Select.Popup');
    return React.createElement(PopoverMotion, { ...props, ...geometry, ref, triggerRef: anchorRef ?? context.anchorRef, isNonModal: !normalizeBoolean(modal, context.modal ?? true, 'Select.Popup modal'), className: classNames('muxui-select-popover', className), 'data-size': context.resolvedSize }, children);
  });
  Select.List = React.forwardRef(function SelectList({ children, items = [], className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    return React.createElement(AriaListBox, { ...props, ref, items: hasChildren ? undefined : normalized, className: classNames('muxui-select-list', className), 'data-size': context.resolvedSize }, hasChildren ? children : (item) => React.createElement(Select.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
  });
  Select.Item = React.forwardRef(function SelectItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaListBoxItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-select-option', className) }, children);
  });
  Select.Description = React.forwardRef(function SelectDescription({ children, className, ...props }, ref) {
    return React.createElement(AriaText, { ...props, ref, elementType: 'span', slot: 'description', className: classNames('muxui-field-description muxui-select-description', className) }, children);
  });
  Select.Error = React.forwardRef(function SelectError({ children, className, ...props }, ref) {
    return React.createElement(AriaFieldError, { ...props, ref, elementType: 'span', className: classNames('muxui-field-error muxui-select-error', className) }, children);
  });
  return Select;
})();

export const RadioGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function RadioGroup({ label, errorMessage, options = [], children, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
    const labelId = React.useId();
    // The visible label text labels the group, so the two cannot drift apart.
    const generatedLabelledby = ariaLabel === undefined && ariaLabelledby === undefined && label !== undefined && label !== null
      ? labelId
      : undefined;
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('RadioGroup orientation must be horizontal or vertical');
    }
    if (options.length > 0 && children !== undefined && children !== null) {
      throw new TypeError('RadioGroup options and children are mutually exclusive');
    }
    const resolvedSize = normalizeChoiceControlSize(size, 'RadioGroup');
    const radioContent = options.length > 0
      ? options.map((option) => React.createElement(AriaRadio, { key: String(option.id ?? option.value), value: String(option.value ?? option.id), isDisabled: disabled || option.disabled, className: classNames('muxui-radio', resolvedSize === undefined || resolvedSize === 'md' ? undefined : `muxui-radio--${resolvedSize}`) }, (renderProps) => React.createElement(React.Fragment, null,
        React.createElement(RadioMotionIndicator, { renderProps }),
        option.label ?? option.value)))
      : children;
    const group = React.createElement(AriaRadioGroup, { ref, name, value, defaultValue, onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, orientation, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? generatedLabelledby, 'data-orientation': orientation, 'data-size': resolvedSize, className: classNames('muxui-radio-group', className) }, radioContent,
      // Inside the group, so RAC wires it into the group's aria-describedby and shows it only while the group is invalid.
      // It is always mounted: without errorMessage it shows the server or browser validation message, as CheckboxGroup does.
      React.createElement(AriaFieldError, { className: 'muxui-field-error muxui-radio-group-error' }, errorMessage));
    const motionGroup = React.createElement(RadioGroupMotion, { rootRef: ref }, group);
    const content = label === undefined
      ? motionGroup
      : React.createElement('div', { className: 'muxui-radio-group-field', 'data-disabled': disabled || undefined, 'data-invalid': invalid || undefined },
        React.createElement('span', { id: generatedLabelledby, className: 'muxui-field-label' }, label),
        motionGroup);
    return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, content);
  });
  component.displayName = 'RadioGroup';
  return component;
})();

export const Slider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'Slider');
    const readOnlyRef = useReadOnlyTargets(ref, readOnly, '[role="slider"], input[type="range"]');
    const preventReadOnlyInteraction = React.useCallback((event) => {
      if (readOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, [readOnly]);
    const handleChange = React.useCallback((next) => {
      if (!disabled && !readOnly) onChange?.(next);
    }, [disabled, onChange, readOnly]);
    const handleChangeEnd = React.useCallback((next) => {
      if (!disabled && !readOnly) onChangeEnd?.(next);
    }, [disabled, onChangeEnd, readOnly]);
    const assignSliderRef = React.useCallback((node) => {
      if (node) {
        if (disabled) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      }
      readOnlyRef(node);
    }, [disabled, readOnlyRef]);
    return React.createElement(AriaSlider, {
      ...props,
      ref: assignSliderRef,
      value,
      defaultValue,
      onChange: handleChange,
      onChangeEnd: readOnly ? undefined : handleChangeEnd,
      minValue: min,
      maxValue: max,
      step,
      isDisabled: disabled,
      orientation,
      'data-readonly': readOnly || undefined,
      onMouseDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onPointerDownCapture: preventReadOnlyInteraction,
      onPointerMoveCapture: preventReadOnlyInteraction,
      onTouchMoveCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(readOnly),
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(SliderMotionTrack, { orientation, readOnly, name })));
  });
  component.displayName = 'Slider';
  return component;
})();

const AriaOutput = AriaSliderOutput;

function normalizeSortDescriptor(value, columns) {
  if (value === undefined) return undefined;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.length !== 2
    || !keys.includes('column') || !keys.includes('direction') || typeof value.column !== 'string'
    || (value.direction !== 'ascending' && value.direction !== 'descending')) {
    throw new TypeError('Table sortDescriptor must be {column: string; direction: ascending|descending}');
  }
  const column = columns.find((candidate) => candidate.id === value.column);
  if (!column || !column.sortable) throw new TypeError(`Table sortDescriptor column must be sortable: ${value.column}`);
  return { column: value.column, direction: value.direction };
}

// Decorative Lucide chevron for sortable Table headers. CSS flips it for
// direction and reveals it for the sorted column, hover, and keyboard focus;
// aria-sort from React Aria carries the real state.
function sortChevron() {
  return React.createElement(ChevronDownIcon, { className: 'muxui-icon muxui-icon--sm muxui-table-sort-icon', 'aria-hidden': 'true', focusable: 'false' });
}

export const Table = React.forwardRef(function Table({ columns = [], rows = [], selectedIds, defaultSelectedIds, onSelectionChange, onRowAction, sortDescriptor, onSortChange, selectionMode = 'none', disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, ...props }, ref) {
  const normalizedRows = normalizeItems(rows);
  // Cells read the consumer's row, not the normalized copy that injects id, label, and value.
  const sourceRows = new Map(normalizedRows.map((row, index) => [row.id, rows[index]]));
  const normalizedColumns = normalizeItems(columns);
  const normalizedSortDescriptor = normalizeSortDescriptor(sortDescriptor, normalizedColumns);
  accessibleName({ ariaLabel }, 'Table');
  const disabledKeys = disabled ? new Set(normalizedRows.map((row) => row.id)) : new Set(normalizedRows.filter((row) => row.disabled).map((row) => row.id));
  return React.createElement(AriaTable, { ...props, ref, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), sortDescriptor: normalizedSortDescriptor, disabledKeys, isDisabled: disabled, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onSortChange: (next) => { if (disabled || !next) return; const descriptor = normalizeSortDescriptor({ column: String(next.column), direction: next.direction }, normalizedColumns); onSortChange?.(descriptor); }, ...(onRowAction ? { onRowAction: (key) => { const row = normalizedRows.find((item) => item.id === String(key)); if (!disabled && !row?.disabled) onRowAction(row); } } : {}), 'aria-label': ariaLabel, 'aria-disabled': disabled || undefined, 'data-disabled': disabled || undefined, className: classNames('muxui-table', className) },
    React.createElement(AriaTableHeader, { columns: normalizedColumns, className: 'muxui-table-header' }, (column) => React.createElement(AriaColumn, { id: column.id, textValue: column.textValue, isRowHeader: column.isRowHeader, allowsSorting: column.sortable, className: 'muxui-table-column' }, column.sortable ? React.createElement('span', { className: 'muxui-table-column-content' }, column.label, sortChevron()) : column.label)),
    React.createElement(AriaTableBody, { items: normalizedRows, className: 'muxui-table-body' }, (row) => React.createElement(AriaRow, { id: row.id, className: 'muxui-table-row' }, normalizedColumns.map((column) => React.createElement(AriaCell, { key: column.id, className: 'muxui-table-cell' }, row.values?.[column.id] ?? sourceRows.get(row.id)?.[column.id] ?? '')))),
  );
});
Table.displayName = 'Table';

export const Tabs = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tabs({ items = [], value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, size, variant = 'underline', children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
    const resolvedSize = normalizeChoiceControlSize(size, 'Tabs');
    const resolvedVariant = normalizeTabsVariant(variant);
    return React.createElement(AriaTabs, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue ?? (normalized.find((item) => !item.disabled) ?? normalized[0])?.id, onSelectionChange: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); }, orientation, keyboardActivation, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tabs', className), 'data-size': resolvedSize, 'data-variant': resolvedVariant },
      React.createElement(TabsMotion, { orientation, variant: resolvedVariant, disabled }, React.createElement(AriaTabList, { items: normalized, className: 'muxui-tab-list' }, (item) => React.createElement(AriaTab, { id: item.id, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-tab' }, React.createElement('span', { className: 'muxui-tab-label' }, item.label)))),
      React.createElement(AriaTabPanels, { items: normalized, className: 'muxui-tab-panels' }, (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tab-panel' }, item.panel)),
    );
  });
  component.displayName = 'Tabs';
  return component;
})();

export const TagGroup = React.forwardRef(function TagGroup({ label, items = [], variant = 'soft', color = 'neutral', selectionMode = 'none', selectedKeys, defaultSelectedKeys, onSelectionChange, onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  const resolvedVariant = normalizeTagOption('variant', TAG_VARIANTS, variant);
  const groupColor = normalizeTagOption('color', TAG_COLORS, color);
  // An item's own colour wins over the group's.
  const tagColor = (item) => (item.color === undefined ? groupColor : normalizeTagOption('item color', TAG_COLORS, item.color));
  normalized.forEach(tagColor);
  // Without selectedKeys the group holds React Aria's own selection value, so range anchors and select-all keep working.
  // It drops the ids of items removed since the last render; a default waiting for its first item is not a removal.
  const controlled = selectedKeys !== undefined;
  const itemIds = new Set(normalized.map((item) => item.id));
  const [held, setHeld] = React.useState(() => new Set(defaultSelectedKeys));
  const [knownIds, setKnownIds] = React.useState(itemIds);
  if (itemIds.size !== knownIds.size || [...itemIds].some((id) => !knownIds.has(id))) {
    setKnownIds(itemIds);
    const removed = new Set([...knownIds].filter((id) => !itemIds.has(id)));
    // Any removal rebuilds the selection as a plain Set: a deselected id can still be a range anchor.
    if (held !== 'all' && removed.size > 0) setHeld(new Set([...held].filter((id) => !removed.has(id))));
  }
  // The application gets a fresh Set of ids; 'all' becomes the enabled ids.
  const handleSelectionChange = (keys) => {
    if (disabled) return;
    if (!controlled) setHeld(keys);
    onSelectionChange?.(keys === 'all' ? new Set(normalized.filter((item) => !item.disabled).map((item) => item.id)) : new Set([...keys].map(String)));
  };
  return React.createElement(AriaTagGroup, { ref, selectionMode, selectedKeys: controlled ? selectedKeys : held, onSelectionChange: handleSelectionChange, ...(onRemove ? { onRemove: (keys) => { if (!disabled) onRemove([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item) => item && !item.disabled)); } } : {}), ...(onAction ? { onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tag-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTagList, { items: normalized, className: 'muxui-tag-list' }, (item) => React.createElement(AriaTag, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, className: 'muxui-tag', 'data-color': tagColor(item), 'data-variant': resolvedVariant }, item.label, onRemove ? React.createElement(IconButton, { slot: 'remove', disabled: disabled || item.disabled, className: 'muxui-tag-remove' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null)));
});
TagGroup.displayName = 'TagGroup';

export const ToggleButtonGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function ToggleButtonGroup({ selectedIds, defaultSelectedIds, onSelectionChange, selectionMode = 'single', orientation = 'horizontal', disabled = false, disallowEmptySelection = false, size = 'md', children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ToggleButtonGroup');
    const selectedKeys = readonlyKeySet(selectedIds, 'selectedIds', selectionMode);
    const defaultSelectedKeys = readonlyKeySet(defaultSelectedIds, 'defaultSelectedIds', selectionMode);
    const resolvedSize = normalizeToggleButtonSize(size, 'ToggleButtonGroup');
    const group = React.createElement(AriaToggleButtonGroup, {
      ...props,
      selectedKeys,
      defaultSelectedKeys,
      selectionMode,
      disallowEmptySelection,
      onSelectionChange: (keys) => {
        if (!disabled) {
          if (keys === 'all') throw new TypeError('ToggleButtonGroup selection cannot be all');
          if (disallowEmptySelection && keys.size === 0) return;
          onSelectionChange?.([...keys].map(String));
        }
      },
      orientation,
      isDisabled: disabled,
      'data-size': resolvedSize,
      className: classNames('muxui-toggle-button-group', className),
    }, children);
    return React.createElement(ToggleButtonSizeContext.Provider, { value: resolvedSize },
      React.createElement(ToggleButtonGroupMotion, { selectionMode, disabled, rootRef: ref }, group));
  });
  component.displayName = 'ToggleButtonGroup';
  return component;
})();

function toTokenValue(values = [], text = '') {
  const segments = values.map((value) => ({ type: 'token', text: String(value), value: String(value) }));
  if (text) segments.push({ type: 'text', text });
  return new TokenFieldValue(segments);
}

function tokenValues(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
}

function draftText(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join('');
}

// Enter commits each trimmed text run as a token in place; blank runs are dropped.
// Duplicate tokens are kept, matching the token array contract.
function commitDraftText(fieldValue) {
  const segments = fieldValue.segments.flatMap((segment) => {
    if (segment.type !== 'text') return [segment];
    const text = segment.text.trim();
    return text ? [{ type: 'token', text, value: text }] : [];
  });
  return new TokenFieldValue(segments, { caretPosition: { index: segments.length, offset: 0 } });
}

function sameTokens(left, right) {
  return left.length === right.length && left.every((token, index) => token === String(right[index]));
}

function useTokenFieldFormReset(onReset) {
  const callbackRef = React.useRef(onReset);
  const formRef = React.useRef(null);
  const listenerRef = React.useRef(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  return React.useCallback((node) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) formRef.current.removeEventListener('reset', listenerRef.current, true);
    formRef.current = nextForm;
    listenerRef.current = null;
    if (!nextForm) return;
    const listener = (event) => {
      const resetToken = ++resetTokenRef.current;
      Promise.resolve().then(() => {
        if (resetTokenRef.current !== resetToken || formRef.current !== nextForm || listenerRef.current !== listener || event.defaultPrevented) return;
        callbackRef.current();
      });
    };
    listenerRef.current = listener;
    nextForm.addEventListener('reset', listener, true);
  }, []);
}

// The public value is the token array; typed text stays an internal draft beside
// the tokens until Enter commits it. React Aria ends IME composition whenever the
// value object changes, so the field value keeps its identity until the tokens or
// the text change.
export const TokenField = React.forwardRef(function TokenField({ label, value, defaultValue = [], onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef(null);
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = [...defaultValue];
  const initialDefaultValue = initialDefaultValueRef.current;
  const [fieldValue, setFieldValue] = React.useState(() => toTokenValue(controlled ? value : initialDefaultValue));
  const [resetVersion, setResetVersion] = React.useState(0);
  let currentFieldValue = fieldValue;
  // Controlled tokens that differ from the field (an outside change or a rejected
  // edit) replace the field tokens and keep the draft text.
  if (controlled && !sameTokens(tokenValues(fieldValue), value)) {
    currentFieldValue = toTokenValue(value, draftText(fieldValue));
    setFieldValue(currentFieldValue);
  }
  const currentValue = tokenValues(currentFieldValue);
  const inputRef = React.useRef(null);
  const showPlaceholder = Boolean(placeholder) && currentFieldValue.toString() === '';
  React.useLayoutEffect(() => {
    if (showPlaceholder) inputRef.current?.setAttribute('aria-placeholder', placeholder);
    else inputRef.current?.removeAttribute('aria-placeholder');
  }, [showPlaceholder, placeholder]);
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setFieldValue(toTokenValue(initialDefaultValue));
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next) => {
    if (disabled || readOnly) return;
    const nextValue = tokenValues(next);
    // A controlled consumer that keeps its tokens rejects the change on the next render.
    setFieldValue(next);
    if (!sameTokens(nextValue, currentValue)) onChange?.(nextValue);
  };
  // React Aria calls onSubmit for Enter (insertParagraph), never mid-composition.
  const handleSubmit = () => {
    if (disabled || readOnly || !draftText(currentFieldValue).trim()) return;
    handleChange(commitDraftText(currentFieldValue));
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: currentFieldValue, onChange: handleChange, onSubmit: handleSubmit, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTokenInput, { ref: inputRef, className: 'muxui-token-input', children: (segment) => segment.type === 'token' ? React.createElement(AriaToken, { className: 'muxui-token' }, segment.text) : null }), React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }), name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null, showPlaceholder ? React.createElement('span', { className: 'muxui-token-placeholder', 'aria-hidden': 'true' }, placeholder) : null);
});
TokenField.displayName = 'TokenField';

export const Toolbar = React.forwardRef(function Toolbar({ orientation = 'horizontal', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  return React.createElement(AriaToolbar, { ...props, ref, orientation, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';

function normalizeTreeItems(items, used = new Set(), parentDisabled = false) {
  return items.map((item, index) => {
    const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const nested = normalizeTreeItems(source.children ?? source.items ?? [], used, parentDisabled || Boolean(source.disabled));
    const label = source.label ?? source.name ?? source.value ?? id;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id), disabled: parentDisabled || Boolean(source.disabled), children: nested };
  });
}

function treeKeys(items, keys = []) {
  for (const item of items) {
    keys.push(item.id);
    treeKeys(item.children ?? [], keys);
  }
  return keys;
}

function findTreeItem(items, key) {
  for (const item of items) {
    if (item.id === String(key)) return item;
    const nested = findTreeItem(item.children ?? [], key);
    if (nested) return nested;
  }
  return undefined;
}

const TREE_EXPANSION_TRIGGERS = new Set(['chevron', 'row']);

function normalizeTreeExpansionTrigger(value = 'row') {
  if (!TREE_EXPANSION_TRIGGERS.has(value)) {
    throw new TypeError('Tree expansionTrigger must be one of: chevron, row');
  }
  return value;
}

const TREE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],[role="checkbox"],[role="combobox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';

function isTreeInteractiveTarget(target, boundary) {
  if (!(target instanceof Element)) return false;
  let current = target;
  while (current && current !== boundary) {
    if (current.matches(TREE_INTERACTIVE_SELECTOR)) return true;
    const contentEditable = current.getAttribute('contenteditable');
    if (contentEditable !== null && contentEditable !== 'false') return true;
    current = current.parentElement;
  }
  return false;
}

function treeItem(item, expansionTrigger, treeDisabled) {
  const nested = item.children ?? [];
  const rowExpansionEnabled = expansionTrigger === 'row' && !treeDisabled && !item.disabled && nested.length > 0;
  const rowExpansion = { toggleKey: undefined };
  return React.createElement(AriaTreeItem, {
    id: item.id,
    textValue: item.textValue,
    hasChildItems: nested.length > 0,
    isDisabled: item.disabled,
    className: 'muxui-tree-item',
    onClickCapture: rowExpansionEnabled ? (event) => {
      if (!event.currentTarget.contains(event.target)) return;
      if (isTreeInteractiveTarget(event.target, event.currentTarget)) return;
      rowExpansion.toggleKey?.();
    } : undefined,
  },
    React.createElement(AriaTreeItemContent, null, ({ state }) => {
      rowExpansion.toggleKey = rowExpansionEnabled ? () => state.toggleKey(item.id) : undefined;
      return React.createElement('div', { className: 'muxui-tree-item-content' },
        nested.length ? React.createElement(IconButton, { slot: 'chevron', 'aria-label': 'Toggle', disabled: item.disabled, className: 'muxui-tree-toggle' }, React.createElement(ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', strokeWidth: 0, size: 16 })) : null,
        React.createElement('span', { className: 'muxui-tree-item-label' }, item.label));
    }),
    nested.map((child) => React.cloneElement(treeItem(child, expansionTrigger, treeDisabled), { key: child.id })));
}

export const Tree = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tree({ items = [], selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, onSelectionChange, onExpandedChange, onAction, selectionMode = 'single', expansionTrigger = 'row', disabled = false, children: _children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Tree');
    const normalizedExpansionTrigger = normalizeTreeExpansionTrigger(expansionTrigger);
    const normalized = normalizeTreeItems(items);
    const allKeys = treeKeys(normalized);
    const disabledKeys = new Set(disabled ? allKeys : allKeys.filter((key) => findTreeItem(normalized, key)?.disabled));
    const expanded = expandedIds === 'all' ? new Set(allKeys) : keySet(expandedIds);
    const defaultExpanded = defaultExpandedIds === 'all' ? new Set(allKeys) : keySet(defaultExpandedIds);
    const motionControllerRef = React.useRef(null);
    const handleExpandedChange = React.useCallback((keys) => {
      motionControllerRef.current?.beforeExpandedChange();
      if (!disabled) onExpandedChange?.(keyList(keys));
    }, [disabled, onExpandedChange]);
    const tree = React.createElement(AriaTree, { ...props, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), expandedKeys: expanded, defaultExpandedKeys: defaultExpanded, disabledKeys, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onExpandedChange: handleExpandedChange, ...(onAction ? { onAction: (key) => { const item = findTreeItem(normalized, key); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, className: classNames('muxui-tree', className) }, normalized.map((item) => React.cloneElement(treeItem(item, normalizedExpansionTrigger, disabled), { key: item.id })));
    return React.createElement(TreeMotion, { rootRef: ref, controllerRef: motionControllerRef }, tree);
  });
  component.displayName = 'Tree';
  return component;
})();

function assertPositiveVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`Virtualizer ${property} must be a finite number greater than 0`);
}

function assertNonNegativeVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new TypeError(`Virtualizer ${property} must be a finite number greater than or equal to 0`);
}

// Mux owns the row-count overscan policy while RAC still owns the collection,
// focus persistence, scroll anchoring, and visible-rect lifecycle.
class MuxFixedRowListLayout extends ListLayout {
  update(invalidationContext) {
    this.overscan = invalidationContext.layoutOptions?.overscan ?? 2;
    super.update(invalidationContext);
  }

  shouldInvalidateLayoutOptions(newOptions, oldOptions) {
    return newOptions?.overscan !== oldOptions?.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  getVisibleLayoutInfos(rect) {
    const visibleRect = this.virtualizer?.visibleRect;
    const rowSize = (this.rowSize ?? this.estimatedRowSize ?? 48) + this.gap;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || rowSize <= 0) return super.getVisibleLayoutInfos(rect);
    const expandedRect = visibleRect.copy();
    const overscanSize = rowSize * (this.overscan ?? 2);
    expandedRect.y = Math.max(0, expandedRect.y - overscanSize);
    expandedRect.height += overscanSize * 2;
    const start = Math.max(0, Math.floor(visibleRect.y / rowSize) - (this.overscan ?? 2));
    const end = Math.ceil((visibleRect.y + visibleRect.height) / rowSize) + (this.overscan ?? 2);
    return super.getVisibleLayoutInfos(expandedRect).filter((layoutInfo) => {
      if (layoutInfo.type !== 'item') return true;
      const index = Math.round((layoutInfo.rect.y - this.padding) / rowSize);
      return (index >= start && index < end) || this.virtualizer.isPersistedKey(layoutInfo.key);
    });
  }
}

// Smallest row in [0, count) that satisfies a monotonic test, or count when none does.
function firstRowWhere(count, test) {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (test(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

// Grid counterpart of MuxFixedRowListLayout. RAC owns the collection, focus
// persistence, and item measurement; Mux owns spacing and row-count overscan.
// It is only built by GridVirtualizer, which supplies every layout option.
class MuxGridLayout extends GridLayout {
  update(invalidationContext) {
    const options = invalidationContext.layoutOptions;
    this.overscan = options.overscan;
    super.update({ ...invalidationContext, layoutOptions: this.fitSpacing(options) });
    this.itemKeys = [];
    this.itemIndex = new Map();
    for (const node of this.virtualizer.collection) {
      if (node.type !== 'item') continue;
      this.itemIndex.set(node.key, this.itemKeys.length);
      this.itemKeys.push(node.key);
    }
  }

  // RAC sizes items from (width - n * space) and spreads the remainder over n + 1
  // gaps, so its visible gap comes out smaller than the space it was given. Size
  // items from n + 1 gaps instead, so columns sit exactly one CSS gap apart and
  // the outer edges get one gap too. Columns still follow RAC's
  // floor(width / (minItemWidth + gap)). Reserving the n + 1 gaps can leave items
  // narrower than minItemWidth: by up to gap / n each, and by more, down to 1px,
  // when even one column is wider than the container. A very large gap shows both.
  fitSpacing({ minItemSize, maxItemSize, minSpace, maxColumns, ...options }) {
    const width = this.virtualizer.size.width;
    const columns = Math.max(1, Math.min(maxColumns, Math.floor(width / (minItemSize.width + minSpace.width))));
    const fit = Math.max(1, Math.floor((width - (columns + 1) * minSpace.width) / columns));
    return {
      ...options,
      minSpace,
      maxColumns: columns,
      minItemSize: new Size(Math.min(minItemSize.width, fit), minItemSize.height),
      maxItemSize: new Size(Math.min(maxItemSize.width, fit), maxItemSize.height),
      maxHorizontalSpace: minSpace.width,
    };
  }

  shouldInvalidateLayoutOptions(newOptions, oldOptions) {
    return newOptions.overscan !== oldOptions.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  // Mounts the rows that intersect the visible rect plus `overscan` whole rows on
  // each side, in collection order, with persisted keys such as the focused item.
  getVisibleLayoutInfos(rect) {
    const { virtualizer, itemKeys, numColumns } = this;
    const visibleRect = virtualizer?.visibleRect;
    const firstItem = itemKeys?.length > 0 ? this.getLayoutInfo(itemKeys[0]) : null;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || !firstItem || numColumns < 1) return super.getVisibleLayoutInfos(rect);
    const rowCount = Math.ceil(itemKeys.length / numColumns);
    const rowRect = (row) => this.getLayoutInfo(itemKeys[row * numColumns]).rect;
    const firstRow = firstRowWhere(rowCount, (row) => rowRect(row).maxY > visibleRect.y);
    const lastRow = firstRowWhere(rowCount, (row) => rowRect(row).y >= visibleRect.maxY) - 1;
    const start = Math.max(0, firstRow - this.overscan) * numColumns;
    // The last row can be partial, so its end is the item count, not a whole row.
    const end = Math.min(itemKeys.length, (lastRow + 1 + this.overscan) * numColumns);
    const persisted = [...virtualizer.persistedKeys]
      .map((key) => this.itemIndex.get(key))
      .filter((index) => index !== undefined && (index < start || index >= end))
      .sort((left, right) => left - right);
    const indexes = [...persisted.filter((index) => index < start)];
    for (let index = start; index < end; index++) indexes.push(index);
    indexes.push(...persisted.filter((index) => index >= end));
    return indexes.map((index) => this.getLayoutInfo(itemKeys[index]));
  }
}

function assertMaxItemWidth(value, minItemWidth) {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isFinite(value) || value < minItemWidth)) {
    throw new TypeError('Virtualizer maxItemWidth must be Infinity or a finite number no smaller than minItemWidth');
  }
}

function assertMaxColumns(value) {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isInteger(value) || value < 1)) {
    throw new TypeError('Virtualizer maxColumns must be Infinity or an integer greater than 0');
  }
}

const NO_GAP = Object.freeze({ column: 0, row: 0 });

// Lays the GridList child out in measured, variable-height rows. The GridList
// owns the scroll region and its CSS gap; the gap it reports becomes the layout spacing.
function GridVirtualizer({ minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan, children }) {
  const [gap, setGap] = React.useState(NO_GAP);
  const reportGap = React.useCallback((next) => {
    setGap((current) => (current.column === next.column && current.row === next.row ? current : next));
  }, []);
  const layoutOptions = React.useMemo(() => ({
    // Equal min and max heights make RAC estimate every unmeasured row as exactly
    // estimatedItemHeight, not scaled with item width. Measured heights ignore it.
    minItemSize: new Size(minItemWidth, estimatedItemHeight),
    maxItemSize: new Size(maxItemWidth, estimatedItemHeight),
    minSpace: new Size(gap.column, gap.row),
    maxColumns,
    // Rows size to their content, so a whole-item aspect ratio can never clip text or actions.
    preserveAspectRatio: false,
    overscan,
  }), [minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan, gap]);
  return React.createElement(GridVirtualizerContext.Provider, { value: reportGap },
    // Observing item size re-measures rows after late font or image loads and text reflow.
    React.createElement(AriaVirtualizer, { layout: MuxGridLayout, layoutOptions, shouldObserveItemSize: true }, children));
}

// Grid mode renders no element of its own, so these belong on its GridList; stack
// mode has no columns. Types forbid both, and these checks fail loudly for JS callers.
const GRIDLIST_OWNED_PROPS = ['aria-label', 'aria-labelledby', 'items', 'height', 'itemHeight', 'disabled', 'onScroll', 'className', 'style'];
const GRID_ONLY_PROPS = ['minItemWidth', 'maxItemWidth', 'estimatedItemHeight', 'maxColumns'];

export const Virtualizer = React.forwardRef(function Virtualizer(rawProps, ref) {
  const { layout = 'stack', items = [], renderItem: _renderItem, itemHeight = 40, height = 240, overscan = 2, disabled = false, children, minItemWidth = 200, maxItemWidth = Number.POSITIVE_INFINITY, estimatedItemHeight = 200, maxColumns = Number.POSITIVE_INFINITY, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, style, onScroll, ...props } = rawProps;
  if (layout !== 'stack' && layout !== 'grid') throw new TypeError('Virtualizer layout must be stack or grid');
  if (layout === 'grid') {
    const misplaced = GRIDLIST_OWNED_PROPS.find((name) => rawProps[name] !== undefined);
    if (misplaced) throw new TypeError(`Virtualizer layout="grid" takes no ${misplaced}; set it on the GridList`);
    assertPositiveVirtualizerNumber(minItemWidth, 'minItemWidth');
    assertPositiveVirtualizerNumber(estimatedItemHeight, 'estimatedItemHeight');
    assertMaxItemWidth(maxItemWidth, minItemWidth);
    assertMaxColumns(maxColumns);
    assertNonNegativeVirtualizerNumber(overscan, 'overscan');
    if (!React.isValidElement(children) || React.Children.count(children) !== 1) throw new TypeError('Virtualizer grid layout requires a single GridList element as its child');
    if (ref !== null) throw new TypeError('Virtualizer grid layout renders no element of its own, so it takes no ref; pass the ref to its GridList');
    return React.createElement(GridVirtualizer, { minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan }, children);
  }
  const gridOnly = GRID_ONLY_PROPS.find((name) => rawProps[name] !== undefined);
  if (gridOnly) throw new TypeError(`Virtualizer ${gridOnly} applies to layout="grid" only`);
  accessibleName({ ariaLabel }, 'Virtualizer');
  assertPositiveVirtualizerNumber(itemHeight, 'itemHeight');
  assertPositiveVirtualizerNumber(height, 'height');
  assertNonNegativeVirtualizerNumber(overscan, 'overscan');
  const normalized = normalizeItems(items);
  return React.createElement(AriaVirtualizer, { layout: MuxFixedRowListLayout, layoutOptions: { rowSize: itemHeight, overscan } },
    React.createElement(AriaListBox, {
      ...props,
      ref,
      items: normalized,
      selectionMode: 'none',
      disabledKeys: disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id)),
      isDisabled: disabled,
      'aria-label': ariaLabel,
      'aria-disabled': disabled || undefined,
      className: classNames('muxui-virtualizer', className),
      style: { ...style, blockSize: height, overflow: 'auto' },
      onScroll: (event) => { if (!disabled) onScroll?.(event); },
    }, (item) => React.createElement(AriaListBoxItem, {
      id: item.id,
      textValue: item.textValue,
      className: 'muxui-virtualizer-item',
      isDisabled: disabled || item.disabled,
    }, item.label ?? item.value ?? item.id)));
});
Virtualizer.displayName = 'Virtualizer';
