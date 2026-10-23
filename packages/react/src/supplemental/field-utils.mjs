import { Text as AriaText } from 'react-aria-components';
import { h, cx } from './part-utils.mjs';

export function fieldText(slot, className, props, ref) {
  return h(AriaText, { ...props, ref, slot, className: cx(className, props?.className) });
}

export function mappedFieldProps({ disabled, invalid, required, readOnly, ...props }) {
  return {
    ...props,
    isDisabled: disabled,
    isInvalid: invalid,
    isRequired: required,
    isReadOnly: readOnly,
  };
}
