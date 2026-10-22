import type { ControlSize, FieldValidationProps } from '../generated/fields.js';
import type { ToggleButtonGroupOwnProps } from '../generated/toggle-button-group.js';

// The control families restate the members they share with the fields, because the catalog's grammar lets
// a type list its members and nothing else. These pins keep each copy equal to the shared member, so one
// cannot drift from the rest. A family is pinned only on the members it exposes: none of them takes
// FieldValidationProps whole, and RadioGroup, Slider, and TokenField leave out its description.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

export type Pins = [
  Expect<Same<ToggleButtonGroupOwnProps['disabled'], FieldValidationProps['disabled']>>,
  // The size is the shared ControlSize, written out as its three values.
  Expect<Same<NonNullable<ToggleButtonGroupOwnProps['size']>, ControlSize>>,
];

// A copy that drifts from the shared member fails the pin.
type DriftedDisabled = Omit<ToggleButtonGroupOwnProps, 'disabled'> & { disabled?: string };
type DriftedSize = Omit<ToggleButtonGroupOwnProps, 'size'> & { size?: 'sm' | 'md' };
// @ts-expect-error The shared disabled member is a boolean.
export type DriftedDisabledPin = Expect<Same<DriftedDisabled['disabled'], FieldValidationProps['disabled']>>;
// @ts-expect-error The shared size is ControlSize.
export type DriftedSizePin = Expect<Same<NonNullable<DriftedSize['size']>, ControlSize>>;
