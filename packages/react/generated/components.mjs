// @generated-from: packages/react/src/components.mjs
// @generated-content-sha256: sha256:1bcf08afb9019170b38b47231ebdf058af2f96e86a78b12d61b9f5a5acb0dcf6
import React from 'react';
import CheckIcon from 'lucide-react/dist/esm/icons/check.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
  Checkbox as AriaCheckbox,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel as AriaDisclosurePanel,
  Group as AriaGroup,
  Link as AriaLink,
  Label as AriaLabel,
  ProgressBar as AriaProgressBar,
  Separator as AriaSeparator,
  ToggleButton as AriaToggleButton,
  Button as AriaButton,
} from 'react-aria-components';

function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
}

function activationEvent(event, target) {
  return {
    type: 'activate',
    pointerType: event?.pointerType || event?.nativeEvent?.pointerType || (event?.detail === 0 ? 'keyboard' : undefined),
    target,
  };
}

export const Breadcrumbs = React.forwardRef(function Breadcrumbs({
  items = [],
  className,
  'aria-label': ariaLabel,
  onNavigate,
  ...props
}, ref) {
  const collectionItems = items.map((item, index) => {
    const { current: _current, ...itemWithoutCurrent } = item;
    return { ...itemWithoutCurrent, id: item.id ?? String(index) };
  });
  const resolvedAriaLabel = ariaLabel ?? 'Breadcrumbs';
  const navigate = (key) => {
    const item = collectionItems.find((candidate) => String(candidate.id) === String(key));
    if (item && !item.disabled) onNavigate?.(item);
  };
  return React.createElement('nav', {
    ...props,
    ref,
    className: classNames('muxui-breadcrumbs', className),
    'aria-label': resolvedAriaLabel,
  }, React.createElement(AriaBreadcrumbs, {
    items: collectionItems,
    className: 'muxui-breadcrumbs-list',
    'aria-label': resolvedAriaLabel,
    onAction: navigate,
    children: (item) => {
      const current = item.id === collectionItems.at(-1)?.id;
      return React.createElement(AriaBreadcrumb, {
        id: item.id,
        isDisabled: item.disabled,
        'data-current': current || undefined,
        'data-disabled': item.disabled || undefined,
        className: 'muxui-breadcrumbs-item',
      }, item.href && !current
        ? React.createElement(AriaLink, { href: item.href, isDisabled: item.disabled, 'data-disabled': item.disabled || undefined, className: 'muxui-breadcrumbs-link' }, item.label)
        : React.createElement('span', { className: 'muxui-breadcrumbs-current', 'aria-current': current ? 'page' : undefined, 'aria-disabled': item.disabled || undefined, 'data-disabled': item.disabled || undefined }, item.label));
    },
  }));
});

Breadcrumbs.displayName = 'Breadcrumbs';

export const Checkbox = React.forwardRef(function Checkbox({
  children,
  checked,
  defaultChecked = false,
  disabled = false,
  indeterminate = false,
  invalid = false,
  name,
  required = false,
  value,
  className,
  onChange,
  ...props
}, ref) {
  return React.createElement(AriaCheckbox, {
    ...props,
    ref,
    className: classNames('muxui-checkbox', className),
    isSelected: checked,
    defaultSelected: defaultChecked,
    isDisabled: disabled,
    isIndeterminate: indeterminate,
    isInvalid: invalid,
    isRequired: required,
    name,
    value,
    onChange,
  }, ({ isSelected, isIndeterminate }) => React.createElement(React.Fragment, null,
    React.createElement('span', {
      className: 'muxui-checkbox-indicator',
      'aria-hidden': 'true',
      'data-selected': isSelected || undefined,
      'data-indeterminate': isIndeterminate || undefined,
    }, isIndeterminate || isSelected
      ? React.createElement(isIndeterminate ? MinusIcon : CheckIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })
      : null),
    React.createElement('span', { className: 'muxui-checkbox-label' }, children)));
});

Checkbox.displayName = 'Checkbox';

export const DisclosureGroup = React.forwardRef(function DisclosureGroup({
  children,
  expandedIds,
  defaultExpandedIds = [],
  multiple = true,
  disabled = false,
  className,
  onExpandedChange,
  ...props
}, ref) {
  const mapKeys = (keys) => new Set((keys ?? []).map(String));
  return React.createElement(AriaDisclosureGroup, {
    ...props,
    ref,
    className: classNames('muxui-disclosure-group', className),
    isDisabled: disabled,
    allowsMultipleExpanded: multiple,
    expandedKeys: expandedIds === undefined ? undefined : mapKeys(expandedIds),
    defaultExpandedKeys: mapKeys(defaultExpandedIds),
    onExpandedChange: (keys) => onExpandedChange?.([...keys].map(String)),
  }, children);
});

DisclosureGroup.displayName = 'DisclosureGroup';

export const Disclosure = React.forwardRef(function Disclosure({
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
  return React.createElement(AriaDisclosure, {
    ...props,
    ref,
    className: classNames('muxui-disclosure', className),
    id,
    isExpanded: expanded,
    defaultExpanded,
    isDisabled: disabled,
    onExpandedChange,
  }, React.createElement(AriaButton, { slot: 'trigger', className: 'muxui-disclosure-trigger' }, title), React.createElement(AriaDisclosurePanel, { role: 'region', className: 'muxui-disclosure-panel' }, children));
});

Disclosure.displayName = 'Disclosure';

export const Group = React.forwardRef(function Group({
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
    'aria-disabled': disabled || undefined,
    'aria-invalid': invalid || undefined,
  }, children);
});

Group.displayName = 'Group';

export const Link = React.forwardRef(function Link({
  children,
  href,
  disabled = false,
  current = false,
  target,
  rel,
  className,
  onActivate,
  ...props
}, ref) {
  return React.createElement(AriaLink, {
    ...props,
    ref,
    href,
    isDisabled: disabled || !href,
    target,
    rel,
    className: classNames('muxui-link', className),
    'aria-current': current ? 'page' : undefined,
    onPress: (event) => onActivate?.(activationEvent(event, event.target)),
  }, children);
});

Link.displayName = 'Link';

export const Meter = React.forwardRef(function Meter({
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
  const formatter = new Intl.NumberFormat(undefined, formatOptions ?? { style: 'percent' });
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
  }, React.createElement('div', { className: 'muxui-meter-header' }, !externalLabel && !externalLabelledby
    ? React.createElement(AriaLabel, { id: labelId, elementType: 'span', className: 'muxui-value-label' }, label)
    : null,
  React.createElement('span', { className: 'muxui-value-output' }, valueText)),
  React.createElement('div', { className: 'muxui-meter-track' }, React.createElement('div', { className: 'muxui-meter-fill', style: { inlineSize: `${percentage}%` } })),
  );
});

Meter.displayName = 'Meter';

export const ProgressBar = React.forwardRef(function ProgressBar({
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
    value: value ?? 0,
    minValue,
    maxValue,
    isIndeterminate: value === undefined,
    'data-indeterminate': value === undefined || undefined,
    'data-complete': complete || undefined,
    className: classNames('muxui-progress-bar', className),
    children: ({ percentage }) => React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'muxui-progress-bar-header' }, React.createElement(AriaLabel, { className: 'muxui-value-label' }, label), React.createElement('span', { className: 'muxui-value-output' }, value === undefined ? 'Loading' : `${percentage}%`)),
      React.createElement('div', { className: 'muxui-progress-bar-track' }, React.createElement('div', { className: 'muxui-progress-bar-fill', style: percentage === undefined ? undefined : { inlineSize: `${percentage}%` } }))),
  });
});

ProgressBar.displayName = 'ProgressBar';

export const Separator = React.forwardRef(function Separator({
  orientation = 'horizontal',
  className,
  ...props
}, ref) {
  return React.createElement(AriaSeparator, {
    ...props,
    ref,
    orientation,
    className: classNames(`muxui-separator muxui-separator-${orientation}`, className),
  });
});

Separator.displayName = 'Separator';

export const ToggleButton = React.forwardRef(function ToggleButton({
  children,
  selected,
  defaultSelected = false,
  disabled = false,
  className,
  onChange,
  onActivate,
  ...props
}, ref) {
  return React.createElement(AriaToggleButton, {
    ...props,
    ref,
    isSelected: selected,
    defaultSelected,
    isDisabled: disabled,
    className: classNames('muxui-toggle-button', className),
    onChange,
    onPress: (event) => onActivate?.(activationEvent(event, event.target)),
  }, children);
});

ToggleButton.displayName = 'ToggleButton';

export {
  Autocomplete,
  CheckboxGroup,
  DateField,
  DatePicker,
  DateRangePicker,
  Form,
  NumberField,
  SearchField,
  Switch,
  TextField,
  TimeField,
} from './fields.mjs';
