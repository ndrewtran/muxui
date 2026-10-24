import type { ForwardedRef, ReactElement } from 'react';
import { Text as AriaText } from 'react-aria-components';
import { h, cx } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';

/** The state flags every field root renames to the names its upstream renderer reads. */
type FieldFlags = { disabled?: boolean; invalid?: boolean; required?: boolean; readOnly?: boolean };

export function fieldText(slot: string, className: string, props: PartProps<HTMLElement> | undefined, ref: ForwardedRef<HTMLElement>): ReactElement {
  return h(AriaText, { ...props, ref, slot, className: cx(className, props?.className) });
}

/** The props without the four flags, plus the renamed flags as `is`-prefixed booleans. */
export function mappedFieldProps<P extends object>({ disabled, invalid, required, readOnly, ...props }: P & FieldFlags): Omit<P & FieldFlags, keyof FieldFlags> & { [renamed: `is${string}`]: boolean | undefined } {
  return {
    ...props,
    isDisabled: disabled,
    isInvalid: invalid,
    isRequired: required,
    isReadOnly: readOnly,
  };
}
