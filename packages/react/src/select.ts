import React from 'react';
import type {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  ForwardRefExoticComponent,
  HTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
  RefAttributes,
  RefObject,
} from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { Label as AriaLabel, Text as AriaText, FieldError as AriaFieldError } from 'react-aria-components';
import { AriaListBox, AriaListBoxItem, AriaSelect, AriaSelectValue } from './substrate.ts';
import type {
  Key,
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxProps as AriaListBoxProps,
  PopoverProps as AriaPopoverProps,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import type { OverlayGeometry, OverlayGeometryInput } from './overlay-positioning.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems } from './collection-items.ts';
import type { MuxUIItems, NormalizedItem } from './collection-items.ts';
import { CollectionTrigger } from './collection-trigger.ts';
import type { FieldValidationProps, MuxUIAccessibleName, NamedFieldProps } from './fields.ts';
import type { MuxUIPlacement } from './overlays.ts';

// The props each part defines, as one type per part: the catalog's web.react API is derived from them
// (Decision 0031), the root's as the family-level block and every other part's under partApis. Each is a
// type literal, so its public props type stays assignable to Record<string, unknown>, as it was before the
// move. The accessible name's arms (aria-label and aria-labelledby), className, and anchorRef stay in the
// public types and are not Mux UI-owned members. Select.Label, Select.Value, Select.Description, and
// Select.Error own no prop. The anatomy calls Select.Item `option`.

/**
 * The props Mux UI defines for Select, which is also Select.Root. Every other attribute of a div passes
 * through to the root.
 */
export type SelectOwnProps = {
  /** The visible label, which also names the field. Without one, name the Select with an aria-label, an aria-labelledby, or a nonempty Select.Label among its children; an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The options as data: strings, or items with an `id`, a `label`, a `textValue`, and `disabled`. Children take precedence: when both are supplied, the items are not rendered. */
  items?: MuxUIItems;
  /** The id of the selected item, when the caller controls it. A named Select submits this id, not the item's `value`. */
  value?: string;
  /** The id of the item selected at first, when the Select controls itself. */
  defaultValue?: string;
  /** Whether the popup is open, when the caller controls it. A disabled Select is closed whatever this says. */
  open?: boolean;
  /** Whether the popup starts open, when the Select controls itself. A disabled Select starts closed. */
  defaultOpen?: boolean;
  /** Disables the trigger and every option. A Select.Trigger or Select.Item's own `disabled={false}` cannot re-enable them under a disabled Select. */
  disabled?: boolean;
  /** The control size. The popup and its options take it too. */
  size?: 'sm' | 'md' | 'lg';
  /** Makes the Select read-only: it keeps its value, and `onChange` is not called when an option is chosen. */
  readOnly?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named Select submits the selected item's id, not the item's `value`. */
  name?: string;
  /** The text the default trigger shows while nothing is selected. */
  placeholder?: string;
  /** Composes the field from Select parts in place of the default trigger, popup, and list; the simple `items`, `selectedContent`, and `trigger` are then not rendered. The `label`, `description`, and `errorMessage` still render. */
  children?: ReactNode;
  /** Content the default trigger shows in place of the selected item's text. */
  selectedContent?: ReactNode;
  /** A native button element that replaces the default trigger, keeping its ref, attributes, and handlers. A Select that is disabled disables it. Any other element throws a TypeError. */
  trigger?: ReactElement<DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, 'button'>;
  /** Where the popup opens against its trigger or anchorRef. start and end follow the locale direction. A Select.Popup's own placement wins over this. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the popup and its trigger, along the placement's side. Must be finite. A Select.Popup's own offset wins over this. */
  offset?: number;
  /** The shift in pixels along the side the popup is placed against. Must be finite. A Select.Popup's own crossOffset wins over this. */
  crossOffset?: number;
  /** Whether the popup moves to the opposite side when the placed side has no room. A Select.Popup's own shouldFlip wins over this. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the popup and the edge of the viewport. Must be finite and not negative. A Select.Popup's own containerPadding wins over this. */
  containerPadding?: number;
  /** Whether the rest of the page is made inaccessible while the popup is open. When false, outside content stays accessible. A Select.Popup's own modal wins over this. */
  modal?: boolean;
  /** Called with the id of the chosen item, or with no value when the selection clears. It is not called while the Select is disabled or read-only. */
  onChange?: (value?: string) => void;
  /** Called with the next open state when the popup opens or closes. It is not called for a request to open a disabled Select. */
  onOpenChange?: (open: boolean) => void;
};

/** Select's options beyond what its label arms and FieldValidationProps carry, as the simple Select takes them. */
export type SelectOptions = Omit<SelectOwnProps, 'label' | 'description' | 'errorMessage'> & { anchorRef?: RefObject<Element | null> };

export type SelectProps = NamedFieldProps & SelectOptions;

/** Select.Root: as Select, but `children` may name the field, in place of a label or an aria-label. */
export type SelectRootProps = SelectOptions & FieldValidationProps & (MuxUIAccessibleName | { children: ReactNode; label?: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string });

/** The props Mux UI defines for Select.Trigger. Every other attribute of a button passes through to it. */
export type SelectTriggerOwnProps = {
  /** Disables the trigger: it can be neither focused nor activated. A disabled Select disables it whatever this says. */
  disabled?: boolean | undefined;
};

export type SelectTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & SelectTriggerOwnProps;

/** The props Mux UI defines for Select.Popup. Every other attribute of a div passes through to the popup. */
export type SelectPopupOwnProps = {
  /** Where the popup opens against its trigger or anchorRef. start and end follow the locale direction. Without one, the Select's placement applies. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the popup and its trigger, along the placement's side. Must be finite. Without one, the Select's offset applies. */
  offset?: number;
  /** The shift in pixels along the side the popup is placed against. Must be finite. Without one, the Select's crossOffset applies. */
  crossOffset?: number;
  /** Whether the popup moves to the opposite side when the placed side has no room. Without one, the Select's shouldFlip applies. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the popup and the edge of the viewport. Must be finite and not negative. Without one, the Select's containerPadding applies. */
  containerPadding?: number;
  /** Whether the rest of the page is made inaccessible while the popup is open. When false, outside content stays accessible. Without one, the Select's modal applies. */
  modal?: boolean;
};

export type SelectPopupProps = HTMLAttributes<HTMLDivElement> & SelectPopupOwnProps & { anchorRef?: RefObject<Element | null> };

/** The props Mux UI defines for Select.List. Every other attribute of a div passes through to the list. */
export type SelectListOwnProps = {
  /** The options as data: strings, or items with an `id`, a `label`, a `textValue`, and `disabled`. Children take precedence: when both are supplied, the items are not rendered. */
  items?: MuxUIItems;
};

type SelectListProps = HTMLAttributes<HTMLDivElement> & SelectListOwnProps;

/** The props Mux UI defines for Select.Item, which the anatomy calls the option. Every other attribute of a div passes through to the option. */
export type SelectItemOwnProps = {
  /** The stable string id the selection reports. A named Select submits it. */
  id: string;
  /** The text typeahead matches. Without one it is the text of the item's children, which is unambiguous only for plain text, so give rich children a `textValue`. */
  textValue?: string;
  /** Disables the item. A disabled Select disables every item whatever this says. */
  disabled?: boolean;
};

export type SelectItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & SelectItemOwnProps;

// A forwardRef result carries no statics, so the compound states them.
type SelectComponent = ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLDivElement>> & {
  Root: ForwardRefExoticComponent<SelectRootProps & RefAttributes<HTMLDivElement>>;
  Label: ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & RefAttributes<HTMLSpanElement>>;
  Trigger: ForwardRefExoticComponent<SelectTriggerProps & RefAttributes<HTMLButtonElement>>;
  Value: ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & RefAttributes<HTMLSpanElement>>;
  Popup: ForwardRefExoticComponent<SelectPopupProps & RefAttributes<HTMLDivElement>>;
  List: ForwardRefExoticComponent<SelectListProps & RefAttributes<HTMLDivElement>>;
  Item: ForwardRefExoticComponent<SelectItemProps & RefAttributes<HTMLDivElement>>;
  Description: ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & RefAttributes<HTMLSpanElement>>;
  Error: ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & RefAttributes<HTMLSpanElement>>;
};

interface SelectContextValue {
  disabled: boolean;
  readOnly?: boolean;
  resolvedSize?: 'sm' | 'md' | 'lg';
  geometry?: OverlayGeometry;
  anchorRef?: RefObject<Element | null> | undefined;
  modal?: boolean;
}

const SelectContext = React.createContext<SelectContextValue>({ disabled: false });

// The geometry a Select falls back to. A parameter default and the geometry helper's fallback both read this record,
// so the default a block states is the one that runs.
const SELECT_GEOMETRY = Object.freeze({ placement: 'bottom-start', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12 } as const);

function selectChildrenProvideLabel(children: ReactNode): boolean {
  return React.Children.toArray(children).some((child) => React.isValidElement<{ children?: ReactNode }>(child)
    && (child.type === Select.Label
      ? Boolean(textContent(child.props.children).trim())
      : selectChildrenProvideLabel(child.props.children)));
}

export const Select: SelectComponent = /*#__PURE__*/ (() => {
  const Select = React.forwardRef<HTMLDivElement, SelectRootProps>(function SelectRoot({ label, description, errorMessage, items, value, defaultValue, open, defaultOpen = false, onOpenChange, onChange, disabled = false, readOnly = false, required = false, invalid = false, placeholder = 'Select an option', selectedContent, trigger, placement = SELECT_GEOMETRY.placement, offset = SELECT_GEOMETRY.offset, crossOffset = SELECT_GEOMETRY.crossOffset, shouldFlip = SELECT_GEOMETRY.shouldFlip, containerPadding = SELECT_GEOMETRY.containerPadding, anchorRef, modal = true, size = 'md', name, children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    if (!selectChildrenProvideLabel(children)) accessibleName({ label, ariaLabel, ariaLabelledby }, 'Select');
    if (trigger !== undefined && (!React.isValidElement(trigger) || trigger.type !== 'button')) throw new TypeError('Select trigger must be a native button element');
    const resolvedSize = normalizeChoiceControlSize(size, 'Select');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, SELECT_GEOMETRY, 'Select');
    const isModal = normalizeBoolean(modal, true, 'Select modal');
    // Conditionals, not ?? and || on the owned props: extraction reads a fallback on an owned prop as an executed default.
    const [internalSelectedKey, setInternalSelectedKey] = React.useState<string | null>(defaultValue === undefined || defaultValue === null ? null : defaultValue);
    const handleSelection = (key: Key | null) => {
      if (disabled) return;
      if (readOnly) return;
      const next = key == null ? null : String(key);
      if (value === undefined) setInternalSelectedKey(next);
      onChange?.(next ?? undefined);
    };
    const selectContext: SelectContextValue = { disabled, readOnly, resolvedSize, geometry, anchorRef, modal: isModal };
    const defaultChildren = React.createElement(React.Fragment, null,
      trigger ? React.createElement(Select.Trigger, { ...trigger.props, disabled: disabled ? disabled : trigger.props.disabled })
        : React.createElement(Select.Trigger, null,
          // Select.Value hands a function child to React Aria's SelectValue with the selection, which the public type, nodes only, does not name.
          React.createElement(Select.Value, null, (selectedContent === undefined || selectedContent === null ? (({ selectedText }: { selectedText: string }) => selectedText || placeholder) : selectedContent) as ReactNode),
          React.createElement(ChevronDownIcon, { className: 'muxui-select__arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 })),
      React.createElement(Select.Popup, null, React.createElement(Select.List, { items })));
    return React.createElement(SelectContext.Provider, { value: selectContext },
      React.createElement(AriaSelect, {
        ...props, ref, selectedKey: value !== undefined ? value : internalSelectedKey,
        isOpen: disabled ? false : open, defaultOpen: !disabled && defaultOpen,
        onOpenChange: (next: boolean) => { if (!disabled || !next) onOpenChange?.(next); },
        onSelectionChange: handleSelection, isDisabled: disabled, isRequired: required,
        isInvalid: invalid ? invalid : undefined, name, placeholder,
        // React Aria's props do not name the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
        ...{ 'data-muxui-state-read-only': readOnly ? readOnly : undefined },
        className: classNames('muxui-select', className),
        ...{ 'data-muxui-size': resolvedSize },
        'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
      },
      label !== undefined ? React.createElement(Select.Label, null, label) : null,
      children === undefined || children === null ? defaultChildren : children,
      description !== undefined ? React.createElement(Select.Description, null, description) : null,
      errorMessage !== undefined ? React.createElement(Select.Error, null, errorMessage) : null));
  }) as SelectComponent;
  Select.displayName = 'Select';

  Select.Root = Select as SelectComponent['Root'];
  Select.Label = React.forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function SelectLabel({ children, className, ...props }, ref) {
    // React Aria types a Label's ref as a label element's, though elementType makes it the span the public type names.
    return React.createElement(AriaLabel, { ...props, ref: ref as Ref<HTMLLabelElement>, elementType: 'span', className: classNames('muxui-field-label muxui-select__label', className) }, children);
  });
  Select.Trigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(function SelectTrigger({ children, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, className: classNames('muxui-select__trigger', className) }, children);
  });
  Select.Value = React.forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function SelectValue({ children, className, ...props }, ref) {
    return React.createElement(AriaSelectValue, { ...props, ref, className: classNames('muxui-select__value', className) }, children);
  });
  Select.Popup = React.forwardRef<HTMLDivElement, SelectPopupProps>(function SelectPopup({ children, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const defaults: Required<OverlayGeometryInput> = { ...SELECT_GEOMETRY, ...context.geometry };
    defaults.placement = defaults.placement.replace(' ', '-');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, defaults, 'Select.Popup');
    return React.createElement(PopoverMotion, { ...(props as AriaPopoverProps), ...geometry, ref, triggerRef: anchorRef ?? context.anchorRef, isNonModal: !normalizeBoolean(modal, context.modal ?? true, 'Select.Popup modal'), className: classNames('muxui-select__popup', className), ...{ 'data-muxui-size': context.resolvedSize } }, children);
  });
  Select.List = React.forwardRef<HTMLDivElement, SelectListProps>(function SelectList({ children, items, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    return React.createElement(AriaListBox<NormalizedItem>, { ...(props as AriaListBoxProps<NormalizedItem>), ref, items: hasChildren ? undefined : normalized, className: classNames('muxui-select__list', className), ...{ 'data-muxui-size': context.resolvedSize }, children: hasChildren ? children : (item: NormalizedItem) => React.createElement(Select.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label) });
  });
  Select.Item = React.forwardRef<HTMLDivElement, SelectItemProps>(function SelectItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(AriaListBoxItem, {
      ...(props as AriaListBoxItemProps), ref, id,
      // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and the item's own text is none.
      textValue: textValue == null ? (textContent(children) || undefined) : textValue,
      isDisabled: effectiveDisabled,
      ...{ 'data-muxui-state-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined },
      className: classNames('muxui-select__option', className),
    }, children);
  });
  Select.Description = React.forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function SelectDescription({ children, className, ...props }, ref) {
    return React.createElement(AriaText, { ...props, ref, elementType: 'span', slot: 'description', className: classNames('muxui-field-description muxui-select__description', className) }, children);
  });
  Select.Error = React.forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function SelectError({ children, className, ...props }, ref) {
    return React.createElement(AriaFieldError, { ...props, ref, elementType: 'span', className: classNames('muxui-field-error muxui-select__error', className) }, children);
  });
  return Select;
})();
