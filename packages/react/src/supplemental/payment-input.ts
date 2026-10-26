import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, InputHTMLAttributes, RefAttributes } from 'react';
import { FieldError as AriaFieldError, Label as AriaLabel } from 'react-aria-components';
import { AriaInput, AriaTextField } from '../substrate.ts';
import type { InputProps as AriaInputProps, TextFieldProps as AriaTextFieldProps } from 'react-aria-components';
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card.mjs';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.ts';

/**
 * The props Mux UI defines for PaymentInput.Root, the compound's root; the catalog's web.react
 * API is derived from this type (Decision 0031). The members every field shares are written out,
 * because the catalog's grammar reads only the members a type lists itself.
 */
type PaymentInputOwnProps = {
  /** The card number, when the caller controls it. */
  value?: string;
  /** The starting card number, when the field controls itself. */
  defaultValue?: string;
  /** Called with the formatted card number each time it changes. */
  onChange?: (value: string) => void;
  /** Marks the field disabled. */
  disabled?: boolean;
  /** Marks the field invalid. */
  invalid?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Marks the field read-only. */
  readOnly?: boolean;
  /** The field's size. */
  size?: 'sm' | 'md' | 'lg';
};

/** The props Mux UI defines for PaymentInput.CardIcon; its API is the card-icon entry in the catalog's partApis. */
type PaymentInputCardIconOwnProps = {
  /** The card type the icon records as its `data-muxui-card-type`, in place of the one detected from the leading digits of the number typed into the field. The glyph is the same for every type. */
  cardType?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
};

export type PaymentInputProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & PaymentInputOwnProps;
export type PaymentInputRootProps = PaymentInputProps;
export type PaymentInputGroupProps = PartProps<HTMLDivElement>;
export type PaymentInputInputProps = InputHTMLAttributes<HTMLInputElement>;
export type PaymentInputLabelProps = PartProps<HTMLLabelElement>;
export type PaymentInputDescriptionProps = PartProps<HTMLElement>;
export type PaymentInputErrorProps = PartProps<HTMLElement>;
export type PaymentInputCardIconProps = Omit<PartProps<HTMLSpanElement>, 'aria-label' | 'children'> & PaymentInputCardIconOwnProps;

type CardType = NonNullable<PaymentInputCardIconOwnProps['cardType']>;

/* PaymentInput */
function cardType(digits: string): CardType {
  if (/^4/u.test(digits)) return 'visa';
  if (/^5[1-5]/u.test(digits)) return 'mastercard';
  const fourDigitPrefix = Number(digits.slice(0, 4));
  if (fourDigitPrefix >= 2221 && fourDigitPrefix <= 2720) return 'mastercard';
  if (/^3[47]/u.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/u.test(digits)) return 'discover';
  return 'unknown';
}

function formatCard(digits: string, type: CardType) {
  const groups = type === 'amex' ? [4, 6, 5] : [4, 4, 4, 4];
  let offset = 0;
  return groups.map((length) => { const part = digits.slice(offset, offset + length); offset += length; return part; }).filter(Boolean).join(' ');
}

const PaymentInputContext = React.createContext<CardType>('unknown');

const PaymentInputRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PaymentInputProps>(function PaymentInputRoot({ value, defaultValue = '', onChange, disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
  const resolvedSize = normalizeChoiceControlSize(size, 'PaymentInput');
  const [digits, setDigits] = React.useState(String(defaultValue).replace(/\D/gu, ''));
  const controlledDigits = value === undefined ? digits : String(value).replace(/\D/gu, '');
  const setValue = (next: string) => { if (value === undefined) setDigits(next); onChange?.(formatCard(next, cardType(next))); };
  // React Aria's props type the handlers on Element, and these on the div; the rest is the div's native attributes.
  return h(PaymentInputContext.Provider, { value: cardType(controlledDigits) }, h(AriaTextField, { ...(mappedFieldProps({ disabled, invalid, required, readOnly, ...props }) as AriaTextFieldProps), ref, value: formatCard(controlledDigits, cardType(controlledDigits)), onChange: (next) => setValue(String(next).replace(/\D/gu, '')), ...{ 'data-muxui-size': resolvedSize }, className: cx('muxui-payment-input', resolvedSize !== 'md' && `muxui-payment-input--${resolvedSize}`, className) }, children));
});
const PaymentInputGroup = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PaymentInputGroupProps>(function PaymentInputGroup(props, ref) { return nativePart('div', 'muxui-payment-input__group', props, ref); });
const PaymentInputInput = /*#__PURE__*/ React.forwardRef<HTMLInputElement, PaymentInputInputProps>(function PaymentInputInput({ disabled, className, ...props }, ref) { return h(AriaInput, { ...(props as AriaInputProps), ref, disabled, inputMode: 'numeric', className: cx('muxui-payment-input__input', className) }); });
const PaymentInputLabel = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, PaymentInputLabelProps>(function PaymentInputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-payment-input__label', props.className) }); });
const PaymentInputDescription = /*#__PURE__*/ React.forwardRef<HTMLElement, PaymentInputDescriptionProps>(function PaymentInputDescription(props, ref) { return fieldText('description', 'muxui-payment-input__description', props, ref); });
const PaymentInputError = /*#__PURE__*/ React.forwardRef<HTMLElement, PaymentInputErrorProps>(function PaymentInputError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-payment-input__error', props.className) }); });
// The aria-label is taken out of the public type, and the render function still discards it by destructuring.
const PaymentInputCardIcon = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, PaymentInputCardIconProps & { 'aria-label'?: unknown }>(function PaymentInputCardIcon({ cardType: suppliedType, className, 'aria-label': _ariaLabel, ...props }, ref) { const contextType = React.useContext(PaymentInputContext); const type = suppliedType === undefined || suppliedType === null ? contextType : suppliedType; return h('span', { ...props, ref, className: cx('muxui-payment-input__card-icon', className), 'data-muxui-card-type': type, 'aria-hidden': true }, h(CreditCardIcon, { size: 16, 'aria-hidden': true, focusable: 'false' })); });
export const PaymentInput: {
  Root: ForwardRefExoticComponent<PaymentInputProps & RefAttributes<HTMLDivElement>>;
  Group: ForwardRefExoticComponent<PaymentInputGroupProps & RefAttributes<HTMLDivElement>>;
  Input: ForwardRefExoticComponent<PaymentInputInputProps & RefAttributes<HTMLInputElement>>;
  Label: ForwardRefExoticComponent<PaymentInputLabelProps & RefAttributes<HTMLLabelElement>>;
  Description: ForwardRefExoticComponent<PaymentInputDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<PaymentInputErrorProps & RefAttributes<HTMLElement>>;
  CardIcon: ForwardRefExoticComponent<PaymentInputCardIconProps & RefAttributes<HTMLSpanElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: PaymentInputRoot,
  Group: PaymentInputGroup,
  Input: PaymentInputInput,
  Label: PaymentInputLabel,
  Description: PaymentInputDescription,
  Error: PaymentInputError,
  CardIcon: PaymentInputCardIcon,
});
