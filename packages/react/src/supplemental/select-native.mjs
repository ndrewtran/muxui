import React from 'react';
import { useField } from 'react-aria';

const h = React.createElement;
const SELECT_NATIVE_SIZES = new Set(['sm', 'md', 'lg']);

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function hasContent(value) {
  if (value === undefined || value === null || typeof value === 'boolean') return false;
  return typeof value !== 'string' || value.trim().length > 0;
}

function hasAriaValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function accessibleName({ label, ariaLabel, ariaLabelledby }) {
  if (!hasContent(label) && !hasAriaValue(ariaLabel) && !hasAriaValue(ariaLabelledby)) {
    throw new TypeError('SelectNative requires label, aria-label, or aria-labelledby');
  }
}

function normalizeSize(size) {
  if (typeof size === 'number') {
    if (!Number.isInteger(size) || size < 1) throw new TypeError('SelectNative native size must be a positive integer.');
    return { visual: 'md', native: size };
  }
  const visual = size ?? 'md';
  if (!SELECT_NATIVE_SIZES.has(visual)) throw new TypeError(`SelectNative size must be one of: ${[...SELECT_NATIVE_SIZES].join(', ')} or a positive native list size.`);
  return { visual, native: undefined };
}

/** A visible native select with Mux field associations and styling. */
export const SelectNative = React.forwardRef(function SelectNative({
  label,
  description,
  errorMessage,
  invalid = false,
  required = false,
  disabled = false,
  size = 'md',
  className,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
  children,
  ...props
}, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby });
  const resolvedSize = normalizeSize(size);
  const hasLabel = hasContent(label);
  const hasDescription = hasContent(description);
  const hasErrorMessage = hasContent(errorMessage);
  const isInvalid = invalid || hasErrorMessage;
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField({
    id,
    // React Aria uses truthiness to decide whether a label exists. Preserve
    // a numeric zero label by passing a truthy fragment to the hook while
    // rendering the caller's node unchanged below.
    label: hasLabel && !label ? h(React.Fragment, null, label) : label,
    description: hasDescription ? description : undefined,
    errorMessage: hasErrorMessage ? errorMessage : undefined,
    isInvalid,
    isRequired: required,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
  });
  const describedBy = [
    hasDescription ? descriptionProps.id : undefined,
    hasErrorMessage ? errorMessageProps.id : undefined,
    ariaDescribedby,
  ].filter(Boolean).join(' ') || undefined;
  const select = h('select', {
    ...props,
    ...fieldProps,
    ref,
    disabled,
    required,
    size: resolvedSize.native,
    'aria-describedby': describedBy,
    'aria-invalid': isInvalid ? true : ariaInvalid,
    className: classNames('muxui-select-native', `muxui-select-native--${resolvedSize.visual}`, className),
    'data-size': resolvedSize.visual,
    'data-disabled': disabled ? '' : undefined,
    'data-required': required ? '' : undefined,
    'data-invalid': isInvalid ? '' : undefined,
  }, children);
  return h('div', {
    className: classNames('muxui-select-native-field', isInvalid && 'muxui-select-native-field--invalid'),
    'data-size': resolvedSize.visual,
    'data-disabled': disabled ? '' : undefined,
    'data-required': required ? '' : undefined,
    'data-invalid': isInvalid ? '' : undefined,
  },
  hasLabel ? h('label', {
    ...labelProps,
    className: 'muxui-select-native__label',
  }, label) : null,
  select,
  hasDescription ? h('span', {
    ...descriptionProps,
    className: 'muxui-select-native__description',
  }, description) : null,
  hasErrorMessage ? h('span', {
    ...errorMessageProps,
    className: 'muxui-select-native__error',
  }, errorMessage) : null);
});

SelectNative.displayName = 'SelectNative';
