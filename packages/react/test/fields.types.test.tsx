import type {
  AutocompleteOwnProps,
  CheckboxGroupOwnProps,
  ControlSize,
  DateFieldOwnProps,
  DatePickerOwnProps,
  DateRangePickerOwnProps,
  FieldValidationProps,
  MuxUIAccessibleName,
  NumberFieldOwnProps,
  SearchFieldOwnProps,
  SwitchOwnProps,
  TextFieldOwnProps,
  TimeFieldOwnProps,
} from '../generated/fields.js';

// Each field's OwnProps restates the members every field shares, because the catalog's grammar lets a
// type list its members and nothing else. These pins keep the ten copies equal to FieldValidationProps
// and the shared size and label types, so one cannot drift from the rest.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

type Shared = 'description' | 'errorMessage' | 'disabled' | 'readOnly' | 'required' | 'invalid';
type NameArm = Extract<MuxUIAccessibleName, { label: unknown }>;

type PinsSharedMembers<Props extends { [Member in Shared | 'size' | 'label']?: unknown }> =
  Same<Pick<Props, Shared>, Pick<FieldValidationProps, Shared>> extends true
    ? Same<Props['size'], FieldValidationProps['size']> extends true
      ? Same<Props['label'], NameArm['label'] | undefined>
      : false
    : false;

export type Pins = [
  Expect<PinsSharedMembers<TextFieldOwnProps>>,
  Expect<PinsSharedMembers<SearchFieldOwnProps>>,
  Expect<PinsSharedMembers<NumberFieldOwnProps>>,
  Expect<PinsSharedMembers<CheckboxGroupOwnProps>>,
  Expect<PinsSharedMembers<SwitchOwnProps>>,
  Expect<PinsSharedMembers<DateFieldOwnProps>>,
  Expect<PinsSharedMembers<TimeFieldOwnProps>>,
  Expect<PinsSharedMembers<DatePickerOwnProps>>,
  Expect<PinsSharedMembers<DateRangePickerOwnProps>>,
  Expect<PinsSharedMembers<AutocompleteOwnProps>>,
  // The size is the shared ControlSize, whether a family names it or writes its three values out.
  Expect<Same<NonNullable<CheckboxGroupOwnProps['size']>, ControlSize>>,
  Expect<Same<NonNullable<AutocompleteOwnProps['size']>, ControlSize>>,
];

// A copy that drifts from the shared member fails the pin.
type DriftedInvalid = Omit<TextFieldOwnProps, 'invalid'> & { invalid?: string };
type DriftedSize = Omit<TextFieldOwnProps, 'size'> & { size?: 'sm' | 'md' };
type DriftedLabel = Omit<TextFieldOwnProps, 'label'> & { label?: string };
// @ts-expect-error The shared invalid member is a boolean.
export type DriftedInvalidPin = Expect<PinsSharedMembers<DriftedInvalid>>;
// @ts-expect-error The shared size is ControlSize.
export type DriftedSizePin = Expect<PinsSharedMembers<DriftedSize>>;
// @ts-expect-error The shared label is the accessible name's label.
export type DriftedLabelPin = Expect<PinsSharedMembers<DriftedLabel>>;
