import React from 'react';
import {
  FieldError as AriaFieldError,
  Input as AriaInput,
  Label as AriaLabel,
  TextField as AriaTextField,
} from 'react-aria-components';
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.mjs';
import { fieldText, mappedFieldProps } from './field-utils.mjs';

/* PaymentInput */
function cardType(digits) {
  if (/^4/u.test(digits)) return 'visa';
  if (/^5[1-5]/u.test(digits)) return 'mastercard';
  const fourDigitPrefix = Number(digits.slice(0, 4));
  if (fourDigitPrefix >= 2221 && fourDigitPrefix <= 2720) return 'mastercard';
  if (/^3[47]/u.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/u.test(digits)) return 'discover';
  return 'unknown';
}

function formatCard(digits, type) {
  const groups = type === 'amex' ? [4, 6, 5] : [4, 4, 4, 4];
  let offset = 0;
  return groups.map((length) => { const part = digits.slice(offset, offset + length); offset += length; return part; }).filter(Boolean).join(' ');
}

const PaymentInputContext = React.createContext('unknown');

export const PaymentInput = {
  Root: React.forwardRef(function PaymentInputRoot({ value, defaultValue = '', onChange, disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'PaymentInput');
    const [digits, setDigits] = React.useState(String(defaultValue).replace(/\D/gu, ''));
    const controlledDigits = value === undefined ? digits : String(value).replace(/\D/gu, '');
    const setValue = (next) => { if (value === undefined) setDigits(next); onChange?.(formatCard(next, cardType(next))); };
    return h(PaymentInputContext.Provider, { value: cardType(controlledDigits) }, h(AriaTextField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, value: formatCard(controlledDigits, cardType(controlledDigits)), onChange: (next) => setValue(String(next).replace(/\D/gu, '')), 'data-size': resolvedSize, className: cx('muxui-payment-input', resolvedSize !== 'md' && `muxui-payment-input--${resolvedSize}`, className) }, children));
  }),
  Group: React.forwardRef(function PaymentInputGroup(props, ref) { return nativePart('div', 'muxui-payment-input__group', props, ref); }),
  Input: React.forwardRef(function PaymentInputInput({ disabled, className, ...props }, ref) { return h(AriaInput, { ...props, ref, disabled, inputMode: 'numeric', className: cx('muxui-payment-input__input', className) }); }),
  Label: React.forwardRef(function PaymentInputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-payment-input__label', props.className) }); }),
  Description: React.forwardRef(function PaymentInputDescription(props, ref) { return fieldText('description', 'muxui-payment-input__description', props, ref); }),
  Error: React.forwardRef(function PaymentInputError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-payment-input__error', props.className) }); }),
  CardIcon: React.forwardRef(function PaymentInputCardIcon({ cardType: suppliedType, className, 'aria-label': _ariaLabel, ...props }, ref) { const contextType = React.useContext(PaymentInputContext); const type = suppliedType ?? contextType; return h('span', { ...props, ref, className: cx('muxui-payment-input__card-icon', className), 'data-card-type': type, 'aria-hidden': true }, h(CreditCardIcon, { size: 16, 'aria-hidden': true, focusable: 'false' })); }),
};
