import React from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Label as AriaLabel,
  Text as AriaText,
  FieldError as AriaFieldError,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems } from './collection-items.ts';
import { CollectionTrigger } from './collection-trigger.ts';

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
