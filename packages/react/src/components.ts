import React from 'react';
import type {
  ButtonHTMLAttributes,
  ForwardRefExoticComponent,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  RefAttributes,
} from 'react';
import CheckIcon from 'lucide-react/dist/esm/icons/check.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { Breadcrumbs as AriaBreadcrumbs, DisclosurePanel as AriaDisclosurePanel, Label as AriaLabel, ProgressBar as AriaProgressBar, Separator as AriaSeparator } from 'react-aria-components';
import { AriaBreadcrumb, AriaCheckbox, AriaDisclosure, AriaDisclosureGroup, AriaGroup, AriaLink, AriaToggleButton, AriaButton } from './substrate.ts';
import type { CheckboxProps as AriaCheckboxProps, LinkProps as AriaLinkProps, PressEvent, ToggleButtonProps as AriaToggleButtonProps } from 'react-aria-components';
import type { ButtonPointerType } from './button.ts';
import { normalizeToggleButtonSize, ToggleButtonSizeContext } from './toggle-button-context.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { GridListItemDisabledContext } from './grid-list-item-context.mjs';
import { MotionHeight, useDisclosureIconMotion } from './motion-components.mjs';

function classNames(base: string, className?: string) {
  return [base, className].filter(Boolean).join(' ');
}

// React Aria hands the attributes its types do not name, such as the data-* hooks the styles read,
// through to the DOM. TypeScript accepts such a key in a call only from a spread, so each
// is spread in as an object.

const DisclosureGroupContext = React.createContext(false);

// What the activation helper reads from a press: React Aria's PressEvent, or the pointer
// event or click behind a synthetic one.
interface PressLike {
  pointerType?: ButtonPointerType;
  nativeEvent?: { pointerType?: ButtonPointerType };
  detail?: number;
}

function activationEvent<Target extends Element>(event: PressLike | undefined, target: Target) {
  return {
    type: 'activate' as const,
    pointerType: event?.pointerType || event?.nativeEvent?.pointerType || (event?.detail === 0 ? 'keyboard' as const : undefined),
    target,
  };
}

/** One level of a Breadcrumbs path. */
export interface BreadcrumbItem {
  /** Identifies the item. An item without one is identified by its position. */
  id?: string;
  /** What the level is called, such as the name of its page. */
  label: ReactNode;
  /** Where the level leads. An item without one, and the last item, render as text. */
  href?: string;
  /** Makes the level text that cannot be navigated to. */
  disabled?: boolean;
}

/**
 * The props Mux UI defines for Breadcrumbs; the catalog's web.react API is derived
 * from this interface (Decision 0031). The accessible name stays in the host part of
 * the props: a native attribute Breadcrumbs requires, not a prop it defines.
 */
export interface BreadcrumbsOwnProps {
  /** The levels of the path, from the top of the hierarchy down to the current page. The last item is the current page. */
  items?: BreadcrumbItem[];
  /** Reports the item a person navigates to, unless it is disabled. */
  onNavigate?: (item: BreadcrumbItem) => void;
}

export interface BreadcrumbsProps extends BreadcrumbsOwnProps, Omit<HTMLAttributes<HTMLElement>, keyof BreadcrumbsOwnProps | 'children' | 'className' | 'aria-label'> {
  className?: string;
  'aria-label': string;
}

// Every item gets an id. A `current` an untyped caller sends is dropped: the last item is the current page.
type BreadcrumbEntry = BreadcrumbItem & { id: string };

/** A trail of links to the levels above the current page. */
export const Breadcrumbs: ForwardRefExoticComponent<BreadcrumbsProps & RefAttributes<HTMLElement>> = React.forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs({
  items = [],
  className,
  'aria-label': ariaLabel,
  onNavigate,
  ...props
}, ref) {
  const collectionItems = items.map((item: BreadcrumbItem & { current?: unknown }, index): BreadcrumbEntry => {
    const { current: _current, ...itemWithoutCurrent } = item;
    return { ...itemWithoutCurrent, id: item.id ?? String(index) };
  });
  const resolvedAriaLabel = ariaLabel ?? 'Breadcrumbs';
  const navigate = (key: React.Key) => {
    const item = collectionItems.find((candidate) => String(candidate.id) === String(key));
    if (item && !item.disabled) onNavigate?.(item);
  };
  return React.createElement('nav', {
    ...props,
    ref,
    className: classNames('muxui-breadcrumbs', className),
    'aria-label': resolvedAriaLabel,
  }, React.createElement(AriaBreadcrumbs<BreadcrumbEntry>, {
    items: collectionItems,
    className: 'muxui-breadcrumbs__list',
    'aria-label': resolvedAriaLabel,
    onAction: navigate,
    children: (item) => {
      const current = item.id === collectionItems.at(-1)?.id;
      return React.createElement(AriaBreadcrumb, {
        id: item.id,
        ...{ isDisabled: item.disabled, 'data-muxui-state-current': current || undefined, 'data-muxui-state-disabled': item.disabled || undefined },
        className: 'muxui-breadcrumbs__item',
      }, item.href && !current
        ? React.createElement(AriaLink, { href: item.href, isDisabled: item.disabled, ...{ 'data-muxui-state-disabled': item.disabled || undefined }, className: 'muxui-breadcrumbs__link' }, item.label)
        : React.createElement('span', { className: 'muxui-breadcrumbs__current', 'aria-current': current ? 'page' : undefined, 'aria-disabled': item.disabled || undefined, 'data-muxui-state-disabled': item.disabled || undefined }, item.label));
    },
  }));
});

Breadcrumbs.displayName = 'Breadcrumbs';

/**
 * The props Mux UI defines for Checkbox; the catalog's web.react API is derived from
 * this interface (Decision 0031). The children are the visible label.
 */
export interface CheckboxOwnProps {
  /** Whether the Checkbox is checked, when the caller controls it. */
  checked?: boolean;
  /** Whether the Checkbox starts checked, when it controls itself. */
  defaultChecked?: boolean;
  /** Disables the Checkbox: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. Without one, a Checkbox in a CheckboxGroup takes the group's size, and any other takes md. */
  size?: 'sm' | 'md' | 'lg';
  /** Shows the mixed state. It is separate from checked, and toggling the Checkbox does not clear it. */
  indeterminate?: boolean;
  /** The name a checked Checkbox submits its value under. */
  name?: string;
  /** Marks the Checkbox required. Left unset, a Checkbox in a CheckboxGroup takes the group's required state. */
  required?: boolean;
  /** The value a checked Checkbox submits. */
  value?: string;
  /** Marks the Checkbox invalid. It shows no error text. */
  invalid?: boolean;
  /** Reports the new checked state. */
  onChange?: (checked: boolean) => void;
}

export interface CheckboxProps extends CheckboxOwnProps, Omit<LabelHTMLAttributes<HTMLLabelElement>, keyof CheckboxOwnProps | 'children' | 'className'> {
  children?: ReactNode;
  className?: string;
}

/** A labelled control that selects or clears one option. */
export const Checkbox: ForwardRefExoticComponent<CheckboxProps & RefAttributes<HTMLLabelElement>> = React.forwardRef<HTMLLabelElement, CheckboxProps>(function Checkbox({
  children,
  checked,
  defaultChecked = false,
  disabled = false,
  size,
  indeterminate = false,
  invalid = false,
  name,
  required,
  value,
  className,
  onChange,
  ...props
}, ref) {
  const inheritedSize = React.useContext(ChoiceControlSizeContext);
  // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and an inherited size is none.
  const resolvedSize = normalizeChoiceControlSize(size == null ? inheritedSize : size, 'Checkbox');
  return React.createElement(AriaCheckbox, {
    // React Aria passes the native attributes it does not own through to the <label>; its focus and
    // keyboard handler types name Element where React's name HTMLLabelElement.
    ...(props as AriaCheckboxProps),
    ref,
    className: classNames(`muxui-checkbox${resolvedSize === 'md' ? '' : ` muxui-checkbox--${resolvedSize}`}`, className),
    ...{ 'data-muxui-size': resolvedSize },
    isSelected: checked,
    defaultSelected: defaultChecked,
    isDisabled: disabled,
    isIndeterminate: indeterminate,
    isInvalid: invalid,
    // Undefined lets a checkbox inherit its CheckboxGroup's required state.
    ...(required === undefined ? {} : { isRequired: required }),
    name,
    value,
    onChange,
    children: ({ isSelected, isIndeterminate }) => React.createElement(React.Fragment, null,
      React.createElement('span', {
        className: 'muxui-checkbox__indicator',
        'aria-hidden': 'true',
        'data-muxui-state-selected': isSelected || undefined,
        'data-muxui-state-indeterminate': isIndeterminate || undefined,
      }, isIndeterminate || isSelected
        ? React.createElement(isIndeterminate ? MinusIcon : CheckIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })
        : null),
      React.createElement('span', { className: 'muxui-checkbox__label' }, children)),
  });
});

Checkbox.displayName = 'Checkbox';

/**
 * The props Mux UI defines for DisclosureGroup; the catalog's web.react API is derived
 * from this interface (Decision 0031). The children are the Disclosures it groups.
 */
export interface DisclosureGroupOwnProps {
  /** The ids of the open Disclosures, when the caller controls them. */
  expandedIds?: string[];
  /** The ids of the Disclosures that start open, when the group controls itself. */
  defaultExpandedIds?: string[];
  /** Lets several Disclosures stay open at once. Turn it off to keep at most one open. */
  multiple?: boolean;
  /** Disables every Disclosure in the group. */
  disabled?: boolean;
  /** Reports the ids of the open Disclosures, as an array of strings. */
  onExpandedChange?: (expandedIds: string[]) => void;
}

export interface DisclosureGroupProps extends DisclosureGroupOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof DisclosureGroupOwnProps | 'children' | 'className'> {
  children?: ReactNode;
  className?: string;
}

/** A set of related Disclosures whose expansion the group owns. */
export const DisclosureGroup: ForwardRefExoticComponent<DisclosureGroupProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, DisclosureGroupProps>(function DisclosureGroup({
  children,
  expandedIds,
  defaultExpandedIds = [],
  multiple = true,
  disabled = false,
  className,
  onExpandedChange,
  ...props
}, ref) {
  const mapKeys = (keys?: string[]) => new Set((keys ?? []).map(String));
  return React.createElement(AriaDisclosureGroup, {
    ...props,
    ref,
    className: classNames('muxui-disclosure-group', className),
    isDisabled: disabled,
    allowsMultipleExpanded: multiple,
    expandedKeys: expandedIds === undefined ? undefined : mapKeys(expandedIds),
    defaultExpandedKeys: mapKeys(defaultExpandedIds),
    onExpandedChange: (keys) => onExpandedChange?.([...keys].map(String)),
  }, React.createElement(DisclosureGroupContext.Provider, { value: true }, children));
});

DisclosureGroup.displayName = 'DisclosureGroup';

function DisclosureChevron({ isOpen, grouped }: { isOpen: boolean; grouped: boolean }) {
  const ref = React.useRef<SVGSVGElement>(null);
  useDisclosureIconMotion(ref, isOpen, grouped);
  return React.createElement(ChevronDownIcon, { ref, className: 'muxui-disclosure__trigger-icon', 'aria-hidden': 'true', focusable: 'false' });
}

/**
 * The props Mux UI defines for Disclosure; the catalog's web.react API is derived
 * from this interface (Decision 0031). The children fill the panel.
 */
export interface DisclosureOwnProps {
  /** The content of the trigger button, which names the section. */
  title: ReactNode;
  /** Whether the Disclosure is open, when the caller controls it. Inside a DisclosureGroup the group owns expansion and this is ignored. */
  expanded?: boolean;
  /** Whether the Disclosure starts open, when it controls itself. */
  defaultExpanded?: boolean;
  /** Disables the Disclosure: it can be neither opened nor closed. */
  disabled?: boolean;
  /** Identifies the Disclosure. A DisclosureGroup's expanded ids refer to it. */
  id?: string;
  /** Reports the Disclosure opening or closing. */
  onExpandedChange?: (expanded: boolean) => void;
}

export interface DisclosureProps extends DisclosureOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof DisclosureOwnProps | 'children' | 'className'> {
  children?: ReactNode;
  className?: string;
}

// The pure-annotated wrapper lets a bundle that never uses Disclosure drop it and its motion edge.
/** A section of optional content that a trigger button opens and closes. */
export const Disclosure: ForwardRefExoticComponent<DisclosureProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, DisclosureProps>(function Disclosure({
    title,
    children,
    id,
    expanded,
    defaultExpanded = false,
    disabled = false,
    className,
    onExpandedChange,
    ...props
  }, ref) {
    const grouped = React.useContext(DisclosureGroupContext);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelHostRef = React.useRef<HTMLDivElement>(null);
    return React.createElement(AriaDisclosure, {
      ...props,
      ref,
      className: classNames('muxui-disclosure', className),
      id,
      isExpanded: expanded,
      defaultExpanded,
      isDisabled: disabled,
      onExpandedChange,
      children: ({ isExpanded }) => {
        const trigger = React.createElement(AriaButton, { ref: triggerRef, slot: 'trigger', className: 'muxui-disclosure__trigger' }, title, grouped
          ? React.createElement(DisclosureChevron, { isOpen: isExpanded, grouped })
          : null);
        return React.createElement(React.Fragment, null,
          grouped ? React.createElement('div', { className: 'muxui-disclosure__header' }, trigger) : trigger,
          React.createElement(AriaDisclosurePanel, {
            ref: panelHostRef,
            role: 'region',
            className: 'muxui-disclosure__panel-host',
            children: React.createElement(MotionHeight, { isOpen: isExpanded, triggerRef, hostRef: panelHostRef, className: 'muxui-disclosure__motion-panel', grouped }, children),
          }));
      },
    });
  });
  component.displayName = 'Disclosure';
  return component;
})();

/**
 * The props Mux UI defines for Group; the catalog's web.react API is derived from this
 * interface (Decision 0031). The accessible name is the native aria-label or
 * aria-labelledby.
 */
export interface GroupOwnProps {
  /** Marks the group disabled. It does not disable the controls inside it. */
  disabled?: boolean;
  /** Marks the group invalid. It does not mark the controls inside it. */
  invalid?: boolean;
  /** Marks the group read-only with a data attribute on its root. It does not lock the controls inside it. */
  readOnly?: boolean;
  /** The role of the group's root. Use presentation when the Group only lays controls out and needs no name. */
  role?: 'group' | 'region' | 'presentation';
}

export interface GroupProps extends GroupOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof GroupOwnProps | 'children' | 'className'> {
  children?: ReactNode;
  className?: string;
}

/** Related controls under one named boundary. */
export const Group: ForwardRefExoticComponent<GroupProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, GroupProps>(function Group({
  children,
  disabled = false,
  invalid = false,
  readOnly = false,
  role = 'group',
  className,
  ...props
}, ref) {
  return React.createElement(AriaGroup, {
    ...props,
    ref,
    role,
    className: classNames('muxui-group', className),
    isDisabled: disabled,
    isInvalid: invalid,
    isReadOnly: readOnly,
    // Conditionals, not ||: extraction reads a fallback on an owned prop as an executed default. Each keeps the prop's own value when it is truthy.
    'aria-disabled': disabled ? disabled : undefined,
    'aria-invalid': invalid ? invalid : undefined,
  }, children);
});

Group.displayName = 'Group';

/** What a Link's `onActivate` reports for one activation. */
export interface LinkActivationEvent {
  readonly type: 'activate';
  readonly pointerType: ButtonPointerType;
  readonly target: HTMLAnchorElement;
}

/**
 * The props Mux UI defines for Link; the catalog's web.react API is derived from this
 * interface (Decision 0031). The children are the link text.
 */
export interface LinkOwnProps {
  /** Where the Link leads. A Link without a non-empty href is disabled. */
  href?: string;
  /** Disables the Link. Left unset, a Link inside a disabled GridList item is disabled too. */
  disabled?: boolean;
  /** Marks the Link as the current page. */
  current?: boolean;
  /** Where to open the destination, as the native target attribute. */
  target?: string;
  /** How the destination relates to this page, as the native rel attribute. */
  rel?: string;
  /** Reports an activation of the Link, in addition to following its href. */
  onActivate?: (event: LinkActivationEvent) => void;
}

export interface LinkProps extends LinkOwnProps, Omit<HTMLAttributes<HTMLElement>, keyof LinkOwnProps | 'children' | 'className' | 'onClick'> {
  children?: ReactNode;
  className?: string;
}

/** A link to another location. */
export const Link: ForwardRefExoticComponent<LinkProps & RefAttributes<HTMLElement>> = React.forwardRef<HTMLElement, LinkProps>(function Link({
  children,
  href,
  disabled,
  current = false,
  target,
  rel,
  className,
  onActivate,
  ...props
}, ref) {
  // Like Button, an undefined disabled inherits a disabled GridList item; an explicit false still
  // wins. A Link without an href is always disabled, and an empty href is not forwarded because
  // React warns about it. The RAC Link always gets an explicit isDisabled.
  const inheritedDisabled = React.useContext(GridListItemDisabledContext);
  return React.createElement(AriaLink, {
    // React Aria passes the native attributes it does not own through to the <a>; its focus and
    // keyboard handler types name Element where React's name HTMLElement.
    ...(props as AriaLinkProps),
    // The public ref type is HTMLElement, a supertype of the anchor React Aria attaches it to.
    ref: ref as React.Ref<HTMLAnchorElement>,
    // Conditionals, not || and ??: extraction reads a fallback on an owned prop as an executed default.
    href: href ? href : undefined,
    isDisabled: !href || (disabled == null ? inheritedDisabled : disabled),
    target,
    rel,
    className: classNames('muxui-link', className),
    ...{ 'aria-current': current ? 'page' : undefined },
    onPress: (event: PressEvent) => onActivate?.(activationEvent(event, event.target as HTMLAnchorElement)),
  }, children);
});

Link.displayName = 'Link';

/**
 * The props Mux UI defines for Meter; the catalog's web.react API is derived from this
 * interface (Decision 0031). The accessible name is the label, or the native aria-label
 * or aria-labelledby.
 */
export interface MeterOwnProps {
  /** The reading, clamped to the range. */
  value?: number;
  /** The bottom of the range. */
  minValue?: number;
  /** The top of the range. */
  maxValue?: number;
  /** The visible name of what is measured. Meter renders it unless aria-label or aria-labelledby names the Meter. */
  label: ReactNode;
  /** How the value text is formatted. Omitted, it formats the position in the range as a percentage. */
  formatOptions?: Intl.NumberFormatOptions;
}

export interface MeterProps extends MeterOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof MeterOwnProps | 'children' | 'className'> {
  className?: string;
}

/** A reading within a known range. */
export const Meter: ForwardRefExoticComponent<MeterProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, MeterProps>(function Meter({
  value = 0,
  minValue = 0,
  maxValue = 100,
  label,
  formatOptions,
  className,
  ...props
}, ref) {
  const externalLabel = props['aria-label'];
  const externalLabelledby = props['aria-labelledby'];
  const labelId = React.useId();
  const boundedValue = Math.min(maxValue, Math.max(minValue, value));
  const percentage = maxValue === minValue ? 0 : ((boundedValue - minValue) / (maxValue - minValue)) * 100;
  // A conditional, not ??: the percent format is the omitted formatOptions' behaviour, not a default the block states.
  const formatter = new Intl.NumberFormat(undefined, formatOptions == null ? { style: 'percent' } : formatOptions);
  const valueText = formatter.format(!formatOptions || formatOptions.style === 'percent' ? percentage / 100 : boundedValue);
  return React.createElement('div', {
    ...props,
    ref,
    role: 'meter',
    className: classNames('muxui-meter', className),
    'aria-label': externalLabel,
    'aria-labelledby': externalLabelledby ?? (externalLabel ? undefined : labelId),
    'aria-valuenow': boundedValue,
    'aria-valuemin': minValue,
    'aria-valuemax': maxValue,
    'aria-valuetext': valueText,
  }, React.createElement('div', { className: 'muxui-meter__header' }, !externalLabel && !externalLabelledby
    ? React.createElement(AriaLabel, { id: labelId, elementType: 'span', className: 'muxui-value-label' }, label)
    : null,
  React.createElement('span', { className: 'muxui-value-output' }, valueText)),
  React.createElement('div', { className: 'muxui-meter__track' }, React.createElement('div', { className: 'muxui-meter__fill', style: { inlineSize: `${percentage}%` } })),
  );
});

Meter.displayName = 'Meter';

/**
 * The props Mux UI defines for ProgressBar; the catalog's web.react API is derived from
 * this interface (Decision 0031).
 */
export interface ProgressBarOwnProps {
  /** How far the task has got, within the range. Omitted, the bar is indeterminate and shows the text Loading. */
  value?: number;
  /** The bottom of the range. */
  minValue?: number;
  /** The top of the range. */
  maxValue?: number;
  /** The visible name of the task. */
  label: ReactNode;
}

export interface ProgressBarProps extends ProgressBarOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof ProgressBarOwnProps | 'children' | 'className'> {
  className?: string;
}

/** How far a task has got. */
export const ProgressBar: ForwardRefExoticComponent<ProgressBarProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar({
  value,
  minValue = 0,
  maxValue = 100,
  label,
  className,
  ...props
}, ref) {
  const complete = value !== undefined && !Number.isNaN(value) && maxValue > minValue && value >= maxValue;
  return React.createElement(AriaProgressBar, {
    ...props,
    ref,
    // A conditional, not ??: an omitted value is indeterminate, so the 0 is no default of the prop.
    value: value == null ? 0 : value,
    minValue,
    maxValue,
    isIndeterminate: value === undefined,
    ...{ 'data-muxui-state-indeterminate': value === undefined || undefined, 'data-muxui-complete': complete || undefined },
    className: classNames('muxui-progress-bar', className),
    children: ({ percentage }) => React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'muxui-progress-bar__header' }, React.createElement(AriaLabel, { className: 'muxui-value-label' }, label), React.createElement('span', { className: 'muxui-value-output' }, value === undefined ? 'Loading' : `${percentage}%`)),
      React.createElement('div', { className: 'muxui-progress-bar__track' }, React.createElement('div', { className: 'muxui-progress-bar__fill', style: percentage === undefined ? undefined : { inlineSize: `${percentage}%` } }))),
  });
});

ProgressBar.displayName = 'ProgressBar';

/**
 * The props Mux UI defines for Separator; the catalog's web.react API is derived from
 * this interface (Decision 0031).
 */
export interface SeparatorOwnProps {
  /** Whether the line runs horizontally or vertically. */
  orientation?: 'horizontal' | 'vertical';
}

export interface SeparatorProps extends SeparatorOwnProps, Omit<HTMLAttributes<HTMLElement>, keyof SeparatorOwnProps | 'children' | 'className'> {
  className?: string;
}

/** A line that separates content. */
export const Separator: ForwardRefExoticComponent<SeparatorProps & RefAttributes<HTMLElement>> = React.forwardRef<HTMLElement, SeparatorProps>(function Separator({
  orientation = 'horizontal',
  className,
  ...props
}, ref) {
  return React.createElement(AriaSeparator, {
    ...props,
    ref,
    orientation,
    className: classNames(`muxui-separator muxui-separator--${orientation}`, className),
  });
});

Separator.displayName = 'Separator';

/** What a ToggleButton's `onActivate` reports for one activation. */
export interface ToggleButtonActivationEvent {
  readonly type: 'activate';
  readonly pointerType: ButtonPointerType;
  readonly target: HTMLButtonElement;
}

/**
 * The props Mux UI defines for ToggleButton; the catalog's web.react API is derived
 * from this interface (Decision 0031). The children are the label.
 */
export interface ToggleButtonOwnProps {
  /** Whether the ToggleButton is on, when the caller controls it. */
  selected?: boolean;
  /** Whether the ToggleButton starts on, when it controls itself. */
  defaultSelected?: boolean;
  /** Disables the ToggleButton: it can be neither focused nor toggled. */
  disabled?: boolean;
  /** The control size. Without one, a ToggleButton in a ToggleButtonGroup takes the group's size, and any other takes md. */
  size?: 'sm' | 'md' | 'lg';
  /** Reports the new selected state. */
  onChange?: (selected: boolean) => void;
  /** Reports an activation of the ToggleButton. */
  onActivate?: (event: ToggleButtonActivationEvent) => void;
}

export interface ToggleButtonProps extends ToggleButtonOwnProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ToggleButtonOwnProps | 'children' | 'className' | 'onClick'> {
  children?: ReactNode;
  className?: string;
}

/** A button that turns a persistent mode or option on and off. */
export const ToggleButton: ForwardRefExoticComponent<ToggleButtonProps & RefAttributes<HTMLButtonElement>> = React.forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton({
  children,
  selected,
  defaultSelected = false,
  disabled = false,
  size,
  className,
  onChange,
  onActivate,
  ...props
}, ref) {
  const inheritedSize = React.useContext(ToggleButtonSizeContext);
  // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and an inherited size is none.
  const resolvedSize = normalizeToggleButtonSize(size == null ? inheritedSize : size);
  return React.createElement(AriaToggleButton, {
    // React Aria passes the native attributes it does not own through to the <button>; its pointer
    // handler types name another element where React's name HTMLButtonElement.
    ...(props as AriaToggleButtonProps),
    ref,
    isSelected: selected,
    defaultSelected,
    isDisabled: disabled,
    className: classNames(`muxui-toggle-button muxui-toggle-button--${resolvedSize}`, className),
    ...{ 'data-muxui-size': resolvedSize },
    onChange,
    onPress: (event: PressEvent) => onActivate?.(activationEvent(event, event.target as HTMLButtonElement)),
  }, children);
});

ToggleButton.displayName = 'ToggleButton';
