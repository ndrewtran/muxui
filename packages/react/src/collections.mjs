import React from 'react';
import { flushSync } from 'react-dom';
import { TreeMotion } from './tree-motion.mjs';
import { MenuMotion } from './menu-motion.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import {
  ComboBox as AriaComboBox,
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

export { Calendar, RangeCalendar } from './calendar.mjs';
export { ColorSwatch } from './color-swatch.mjs';
export { ColorField } from './color-field.mjs';
export { ColorArea } from './color-area.mjs';
export { ColorSlider } from './color-slider.mjs';
export { ColorWheel } from './color-wheel.mjs';
export { ColorPicker } from './color-picker.mjs';
export { ColorSwatchPicker } from './color-swatch-picker.mjs';
export { ListBox } from './list-box.mjs';
export { GridList } from './grid-list.mjs';
export { Virtualizer } from './virtualizer.mjs';

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
