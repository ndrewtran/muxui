import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { Label as AriaLabel, Text as AriaText, FieldError as AriaFieldError, ListBoxSection as AriaListBoxSection, Header as AriaHeader, ComboBoxStateContext as AriaComboBoxStateContext } from 'react-aria-components';
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
// and are not Mux UI-owned members. ComboBox has no part of its own: the anatomy's input, list, section, header, and
// option are rendered, not exported.

/** A named group of ComboBox options, which the list shows under its title. */
export interface ComboBoxSection {
  /** The section's stable id. It must differ from every other section's id and every item's id. */
  id: string;
  /** The visible heading, which also names the group for assistive technology. */
  title: Exclude<ReactNode, null | undefined | boolean>;
  /** The section's options, in the same forms `items` takes. */
  items: MuxUIItems;
}

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
  /** The full option set in named groups, in place of `items`, filtered the same way. A group with no matching option is hidden. Item ids are unique across the groups. */
  sections?: readonly ComboBoxSection[];
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

// A section as the list renders it: its options normalized, with ids unique across every section.
type NormalizedSection = { id: string; title: ReactNode; items: NormalizedItem[] };

// Normalizes the options of every section as one list, so their ids are unique across sections, then splits them back.
function normalizeSections(sections: readonly ComboBoxSection[]): NormalizedSection[] {
  const flat = normalizeItems(sections.flatMap((section) => section.items));
  const ids = new Set(flat.map((item) => item.id));
  let start = 0;
  return sections.map((section) => {
    if (typeof section.id !== 'string' || section.id === '' || ids.has(section.id)) throw new TypeError(`ComboBox section id must be a nonempty string unique among the sections and items: ${String(section.id)}`);
    ids.add(section.id);
    const items = flat.slice(start, (start += section.items.length));
    return { id: section.id, title: section.title, items };
  });
}

// A section is a named group: React Aria labels it by its header, filters its options, and hides it when none match.
// React Aria shows its own section nodes while the list shows every option and filtered copies of them while it
// filters, and React's development build throws when it compares the two as props of one mounted section. So the list
// mounts afresh when it changes between them. The tree React Aria builds its collection from has no combobox state,
// so its key never changes. A section with no options is left out, so no empty group is exposed.
function SectionedList({ sections, size }: { sections: NormalizedSection[]; size: string }) {
  const state = React.useContext(AriaComboBoxStateContext);
  const first = state ? [...state.collection][0] : undefined;
  const filtered = first !== undefined && Object.prototype.hasOwnProperty.call(first, 'childNodes');
  return React.createElement(AriaListBox<NormalizedSection>, { key: filtered ? 'filtered' : 'all', className: 'muxui-combo-box__list', ...{ 'data-muxui-size': size } }, sections.filter((section) => section.items.length > 0).map((section) => React.createElement(AriaListBoxSection, { key: section.id, id: section.id, className: 'muxui-combo-box__section' },
    React.createElement(AriaHeader, { className: 'muxui-combo-box__header' }, section.title),
    section.items.map((item) => React.createElement(React.Fragment, { key: item.id }, renderOption(item))))));
}

function renderOption(item: NormalizedItem) {
  return React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, isDisabled: item.disabled, ...{ 'data-muxui-state-disabled': item.disabled || undefined, 'aria-disabled': item.disabled || undefined }, className: 'muxui-combo-box__option' }, item.label);
}

export const ComboBox: ForwardRefExoticComponent<ComboBoxProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, ComboBoxProps & DiscardedComboBoxProps>(function ComboBox({ label, description, errorMessage, items, sections, value, defaultValue, selectedId, defaultSelectedId, onChange, onSelect, disabled = false, readOnly = false, required = false, invalid = false, placeholder, size = 'md', name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ComboBox');
    if (selectedId === '') throw new TypeError('ComboBox selectedId must be an item id, or null for no selection; an empty string is not an id');
    if (defaultSelectedId === '') throw new TypeError('ComboBox defaultSelectedId must be an item id; omit it for no selection');
    const resolvedSize = normalizeChoiceControlSize(size, 'ComboBox');
    if (items !== undefined && sections !== undefined) throw new TypeError('ComboBox takes items or sections, not both');
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const grouped = sections === undefined ? undefined : normalizeSections(sections);
    const normalized = grouped === undefined ? normalizeItems(items) : grouped.flatMap((section) => section.items);
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
    // The list is at least as wide as the field, so zero container padding keeps a full-width field's list aligned
    // at the viewport edge instead of pushed past it; the position hook still keeps the list on screen.
    return React.createElement(AriaComboBox<NormalizedItem | NormalizedSection>, { ...props, ref, defaultItems: grouped === undefined ? normalized : grouped, disabledKeys, ...(value === undefined ? {} : { inputValue: value }), defaultInputValue: defaultValue, selectedKey: selectedId, defaultSelectedKey: defaultSelectedId, onInputChange: handleInput, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid ? invalid : undefined, name, className: classNames('muxui-combo-box', className), ...{ 'data-muxui-size': resolvedSize }, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(AriaGroup, { className: 'muxui-combo-box__control' },
        React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
        React.createElement(IconButton, { className: 'muxui-combo-box__trigger', 'aria-label': 'Show options' },
          React.createElement(ChevronDownIcon, { className: 'muxui-combo-box__arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
      description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
      errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
      React.createElement(PopoverMotion, { containerPadding: 0, className: 'muxui-combo-box__popover', ...{ 'data-muxui-size': resolvedSize } }, grouped === undefined
        ? React.createElement(AriaListBox<NormalizedItem>, { items: normalized, className: 'muxui-combo-box__list', ...{ 'data-muxui-size': resolvedSize }, children: renderOption })
        : React.createElement(SectionedList, { sections: grouped, size: resolvedSize })),
    );
  });
  component.displayName = 'ComboBox';
  return component;
})();
