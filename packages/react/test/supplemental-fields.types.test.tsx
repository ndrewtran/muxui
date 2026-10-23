import type { ControlSize, FieldValidationProps } from '../generated/fields.js';
import type { CheckboxFieldRootProps } from '../generated/checkbox-field.js';
import type { InputRootProps } from '../generated/input.js';
import type { PaymentInputRootProps } from '../generated/payment-input.js';
import type { RadioFieldRootProps } from '../generated/radio-field.js';
import type { SwitchFieldRootProps } from '../generated/switch-field.js';
import type { TextAreaRootProps } from '../generated/text-area.js';

// The field families restate the members they share with the fields, because the catalog's grammar lets
// a type list its members and nothing else. These pins keep each copy equal to the shared member.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type PinsMembers<Props extends { [Member in Members]?: unknown }, Members extends keyof FieldValidationProps> =
  Same<Pick<Props, Members>, Pick<FieldValidationProps, Members>>;

export type Pins = [
  Expect<PinsMembers<InputRootProps, 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  Expect<PinsMembers<TextAreaRootProps, 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  Expect<PinsMembers<PaymentInputRootProps, 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  Expect<PinsMembers<CheckboxFieldRootProps, 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  Expect<PinsMembers<SwitchFieldRootProps, 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  // A RadioField takes no read-only flag: the group owns it.
  Expect<PinsMembers<RadioFieldRootProps, 'disabled' | 'required' | 'invalid'>>,
  // The size is the shared ControlSize, written out as its three values.
  Expect<Same<NonNullable<InputRootProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<TextAreaRootProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<PaymentInputRootProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<CheckboxFieldRootProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<SwitchFieldRootProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<RadioFieldRootProps['size']>, ControlSize>>,
];

// A copy that drifts from the shared member fails the pin.
type DriftedInvalid = Omit<InputRootProps, 'invalid'> & { invalid?: string };
type DriftedSize = Omit<RadioFieldRootProps, 'size'> & { size?: 'sm' | 'md' };
// @ts-expect-error The shared invalid member is a boolean.
export type DriftedInvalidPin = Expect<PinsMembers<DriftedInvalid, 'invalid'>>;
// @ts-expect-error The shared size is ControlSize.
export type DriftedSizePin = Expect<Same<NonNullable<DriftedSize['size']>, ControlSize>>;
