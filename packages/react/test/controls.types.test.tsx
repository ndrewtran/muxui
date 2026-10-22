import type { ControlSize, FieldValidationProps, MuxUIAccessibleName } from '../generated/fields.js';
import type { RadioGroupOwnProps } from '../generated/radio-group.js';
import type { SliderOwnProps } from '../generated/slider.js';
import type { ToggleButtonGroupOwnProps } from '../generated/toggle-button-group.js';

// The control families restate the members they share with the fields, because the catalog's grammar lets
// a type list its members and nothing else. These pins keep each copy equal to the shared member, so one
// cannot drift from the rest. A family is pinned only on the members it exposes: none of them takes
// FieldValidationProps whole, so none is intersected with it.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

type NameArm = Extract<MuxUIAccessibleName, { label: unknown }>;
type PinsMembers<Props extends { [Member in Members]?: unknown }, Members extends keyof FieldValidationProps> =
  Same<Pick<Props, Members>, Pick<FieldValidationProps, Members>>;
type PinsLabel<Props extends { label?: unknown }> = Same<Props['label'], NameArm['label'] | undefined>;

export type Pins = [
  Expect<PinsLabel<RadioGroupOwnProps>>,
  Expect<PinsMembers<RadioGroupOwnProps, 'errorMessage' | 'disabled' | 'readOnly' | 'required' | 'invalid'>>,
  Expect<PinsLabel<SliderOwnProps>>,
  Expect<PinsMembers<SliderOwnProps, 'disabled' | 'readOnly'>>,
  Expect<PinsMembers<ToggleButtonGroupOwnProps, 'disabled'>>,
  // The size is the shared ControlSize, written out as its three values.
  Expect<Same<NonNullable<RadioGroupOwnProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<ToggleButtonGroupOwnProps['size']>, ControlSize>>,
];

// A copy that drifts from the shared member fails the pin.
type DriftedDisabled = Omit<SliderOwnProps, 'disabled'> & { disabled?: string };
type DriftedLabel = Omit<SliderOwnProps, 'label'> & { label?: string };
type DriftedSize = Omit<ToggleButtonGroupOwnProps, 'size'> & { size?: 'sm' | 'md' };
type DriftedInvalid = Omit<RadioGroupOwnProps, 'invalid'> & { invalid?: string };
// @ts-expect-error The shared invalid member is a boolean.
export type DriftedInvalidPin = Expect<PinsMembers<DriftedInvalid, 'invalid'>>;
// @ts-expect-error The shared disabled member is a boolean.
export type DriftedDisabledPin = Expect<PinsMembers<DriftedDisabled, 'disabled' | 'readOnly'>>;
// @ts-expect-error The shared label is the accessible name's label.
export type DriftedLabelPin = Expect<PinsLabel<DriftedLabel>>;
// @ts-expect-error The shared size is ControlSize.
export type DriftedSizePin = Expect<Same<NonNullable<DriftedSize['size']>, ControlSize>>;
