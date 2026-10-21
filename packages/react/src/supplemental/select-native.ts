import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes, SelectHTMLAttributes } from 'react';
import { useField } from 'react-aria';

/** The visual sizes of SelectNative. */
export type SelectNativeVisualSize = 'sm' | 'md' | 'lg';

/**
 * The props Mux UI defines for SelectNative; the catalog's web.react API is derived
 * from this interface (Decision 0031). The select's native attributes, such as value,
 * onChange, multiple, and name, pass through unchanged.
 */
interface SelectNativeOwnProps {
  /** The visible label, associated with the select. */
  label?: ReactNode;
  /** Help text, associated with the select. */
  description?: ReactNode;
  /** Error text, associated with the select. A nonempty message makes the select invalid. */
  errorMessage?: ReactNode;
  /** Applies the native disabled attribute. */
  disabled?: boolean;
  /** Applies the native required attribute. */
  required?: boolean;
  /** Marks the select invalid. */
  invalid?: boolean;
  /** String values select Mux control targets; positive numbers pass to native select size. */
  size?: SelectNativeVisualSize | number;
}

export interface SelectNativeProps extends SelectNativeOwnProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, keyof SelectNativeOwnProps | 'className'> {
  className?: string;
}

const h = React.createElement;
// Keyed by the type, so a size added to it must be added here too.
const VISUAL_SIZES: Readonly<Record<SelectNativeVisualSize, true>> = { sm: true, md: true, lg: true };
// Untyped callers can pass anything; Object.hasOwn alone would coerce ['md'] to a key.
const isVisualSize = (value: unknown): value is SelectNativeVisualSize => typeof value === 'string' && Object.hasOwn(VISUAL_SIZES, value);

function classNames(...values: unknown[]) {
  return values.filter(Boolean).join(' ');
}

function hasContent(value: unknown) {
  if (value === undefined || value === null || typeof value === 'boolean') return false;
  return typeof value !== 'string' || value.trim().length > 0;
}

function hasAriaValue(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function accessibleName({ label, ariaLabel, ariaLabelledby }: { label: unknown; ariaLabel: unknown; ariaLabelledby: unknown }) {
  if (!hasContent(label) && !hasAriaValue(ariaLabel) && !hasAriaValue(ariaLabelledby)) {
    throw new TypeError('SelectNative requires label, aria-label, or aria-labelledby');
  }
}

// Untyped callers can pass anything, so the size is checked as it arrives.
function normalizeSize(size: unknown): { visual: SelectNativeVisualSize; native: number | undefined } {
  if (typeof size === 'number') {
    if (!Number.isInteger(size) || size < 1) throw new TypeError('SelectNative native size must be a positive integer.');
    return { visual: 'md', native: size };
  }
  const visual = size ?? 'md';
  if (!isVisualSize(visual)) throw new TypeError(`SelectNative size must be one of: ${Object.keys(VISUAL_SIZES).join(', ')} or a positive native list size.`);
  return { visual, native: undefined };
}

/** A visible native select with Mux field associations and styling. */
export const SelectNative: ForwardRefExoticComponent<SelectNativeProps & RefAttributes<HTMLSelectElement>> = React.forwardRef<HTMLSelectElement, SelectNativeProps>(function SelectNative({
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
  // An error message makes the select invalid, as invalid does. Not invalid || ...: extraction
  // reads || on an owned prop with a false default as a fallback the component executes.
  const isInvalid = hasErrorMessage || invalid;
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField({
    id,
    // React Aria uses truthiness to decide whether a label exists. Preserve
    // a numeric zero label by passing a truthy fragment to the hook while
    // rendering the caller's node unchanged below.
    label: hasLabel && !label ? h(React.Fragment, null, label) : label,
    description: hasDescription ? description : undefined,
    errorMessage: hasErrorMessage ? errorMessage : undefined,
    isInvalid,
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
