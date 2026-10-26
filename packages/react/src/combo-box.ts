import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { Label as AriaLabel, Text as AriaText, FieldError as AriaFieldError } from 'react-aria-components';
import { AriaComboBox, AriaListBox, AriaListBoxItem, AriaGroup, AriaInput } from './substrate.ts';
import type { Key } from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUIItems, NormalizedItem } from './collection-items.ts';
import type { NamedFieldProps } from './fields.ts';

// The props ComboBox defines, as one type: the catalog's web.react API is derived from it (Decision 0031).
// It is a type literal, so the public props type stays assignable to Record<string, unknown>, as it was before
// the move. The accessible name's arms (aria-label and aria-labelledby) and className stay in the public type
// and are not Mux UI-owned members. ComboBox has no part of its own: the anatomy's input, list, and option are
// rendered, not exported.

/** The props Mux UI defines for ComboBox. Every other attribute of a div passes through to the root. */
export type ComboBoxOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The full option set, filtered as the user types by a case- and accent-insensitive contains match on each item's text. Pass every option rather than a pre-filtered list. */
  items?: MuxUIItems;
  /** The text in the input, when the caller controls it. When the selected id is also controlled, choosing an option does not update the text: the application sets it, usually to the option's label. */
  value?: string;
  /** The text in the input at first, when the field controls itself. */
  defaultValue?: string;
  /** The id of the selected item, when the caller controls the selection. A controlled field with no selection passes null; an empty string is not an id and throws. A controlled selectedId stays until the application changes it. */
  selectedId?: string | null;
  /** The id of the item selected at first, when the field controls its selection. An empty string is not an id and throws. */
  defaultSelectedId?: string;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. The option list takes it too. */
  size?: 'sm' | 'md' | 'lg';
  /** Makes the field read-only: its text stays visible and focusable but cannot be changed, and no option can be chosen. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits the selected item's id, not the item's `value`, or an empty value when nothing is selected. */
  name?: string;
  /** An example value shown while the field is empty. It does not name the field. */
  placeholder?: string;
  /** Called with the text each time it changes, including when choosing an option sets it to the option's label. */
  onChange?: (value: string) => void;
  /** Called with the chosen item, or with no item when the selection clears. Emptying the input clears the selection. */
  onSelect?: (item?: MuxUICollectionItem) => void;
};

export type ComboBoxProps = Omit<ComboBoxOwnProps, 'label'> & NamedFieldProps;

// A React Aria prop that ComboBox does not publish. The component destructures it so a value an untyped caller
// passes never reaches React Aria through the rest spread.
type DiscardedComboBoxProps = { children?: unknown };

export const ComboBox: ForwardRefExoticComponent<ComboBoxProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, ComboBoxProps & DiscardedComboBoxProps>(function ComboBox({ label, description, errorMessage, items, value, defaultValue, selectedId, defaultSelectedId, onChange, onSelect, disabled = false, readOnly = false, required = false, invalid = false, placeholder, size = 'md', name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ComboBox');
    if (selectedId === '') throw new TypeError('ComboBox selectedId must be an item id, or null for no selection; an empty string is not an id');
    if (defaultSelectedId === '') throw new TypeError('ComboBox defaultSelectedId must be an item id; omit it for no selection');
    const resolvedSize = normalizeChoiceControlSize(size, 'ComboBox');
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeItems(items);
    const disabledKeys = new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
    // React Aria reports a cleared selection as a null key, except when both the text and
    // the selection are controlled: then the application owns both, so the clear is read from the emptied input.
    const bothControlled = value !== undefined && selectedId !== undefined;
    // Two checks, not ||: extraction reads a fallback on an owned prop as an executed default.
    const handleSelection = (key: Key | null) => {
      if (disabled) return;
      if (readOnly) return;
      if (key == null) {
        if (!bothControlled) onSelect?.(undefined);
        return;
      }
      const item = normalized.find((candidate) => candidate.id === String(key));
      if (item && !item.disabled) onSelect?.(item);
    };
    const handleInput = (next: string) => {
      if (disabled) return;
      if (readOnly) return;
      onChange?.(next);
      if (bothControlled && next === '' && selectedId !== null) onSelect?.(undefined);
    };
    // defaultItems lets React Aria filter options by the typed text; items would mean consumer-filtered.
    return React.createElement(AriaComboBox<NormalizedItem>, { ...props, ref, defaultItems: normalized, disabledKeys, ...(value === undefined ? {} : { inputValue: value }), defaultInputValue: defaultValue, selectedKey: selectedId, defaultSelectedKey: defaultSelectedId, onInputChange: handleInput, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid ? invalid : undefined, name, className: classNames('muxui-combo-box', className), ...{ 'data-muxui-size': resolvedSize }, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(AriaGroup, { className: 'muxui-combo-control' },
        React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
        React.createElement(IconButton, { className: 'muxui-combo-box-trigger', 'aria-label': 'Show options' },
          React.createElement(ChevronDownIcon, { className: 'muxui-combo-box-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
      description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
      errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
      React.createElement(PopoverMotion, { className: 'muxui-combo-box-popover', ...{ 'data-muxui-size': resolvedSize } }, React.createElement(AriaListBox<NormalizedItem>, { items: normalized, className: 'muxui-combo-box-list', ...{ 'data-muxui-size': resolvedSize }, children: (item: NormalizedItem) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, isDisabled: item.disabled, ...{ 'data-muxui-state-disabled': item.disabled || undefined, 'aria-disabled': item.disabled || undefined }, className: 'muxui-combo-box-option' }, item.label) })),
    );
  });
  component.displayName = 'ComboBox';
  return component;
})();
