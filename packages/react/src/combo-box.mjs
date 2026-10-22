import React from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import {
  ComboBox as AriaComboBox,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Group as AriaGroup,
  Label as AriaLabel,
  Input as AriaInput,
  Text as AriaText,
  FieldError as AriaFieldError,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';

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
