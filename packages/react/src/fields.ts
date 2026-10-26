import React from 'react';
import type {
  FocusEvent,
  ForwardRefExoticComponent,
  FormEventHandler,
  FormHTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactElement,
  ReactNode,
  Ref,
  RefAttributes,
  RefObject,
} from 'react';
import { animate } from 'motion/react';
import { CalendarHeightMotion } from './calendar-height-motion.mjs';
import { Autocomplete as AriaAutocomplete, CalendarGrid as AriaCalendarGrid, CalendarGridBody as AriaCalendarGridBody, CalendarGridHeader as AriaCalendarGridHeader, CalendarHeaderCell as AriaCalendarHeaderCell, CalendarHeading as AriaCalendarHeading, Dialog as AriaDialog, FieldError as AriaFieldError, Form as AriaForm, InputContext as AriaInputContext, Label as AriaLabel, Text as AriaText } from 'react-aria-components';
import { AriaCalendar, AriaCalendarCell, AriaCheckboxGroup, AriaDateField, AriaDateInput, AriaDatePicker, AriaDateRangePicker, AriaDateSegment, AriaGroup, AriaInput, AriaListBox, AriaListBoxItem, AriaNumberField, AriaRangeCalendar, AriaSearchField, AriaSwitchButton, AriaSwitchField, AriaTextField, AriaTimeField } from './substrate.ts';
import type { DateValue, FormProps as AriaFormProps, InputProps as AriaInputProps, Key, TimeValue } from 'react-aria-components';
import { parseDate, parseTime } from '@internationalized/date';
import type { CalendarDate, Time } from '@internationalized/date';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import PlusIcon from 'lucide-react/dist/esm/icons/plus.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { DatePopoverMotion } from './date-popover-motion.mjs';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { RangeSelectionMotion } from './range-selection-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import type { IconButtonProps } from './supplemental/icon-button.ts';

// React Aria hands the attributes its types do not name, such as the data-* hooks the styles read,
// through to the DOM. TypeScript accepts such a key in a call only from a spread, so each
// is spread in as an object.

/** A calendar date as an ISO string, `YYYY-MM-DD`, with no time or time zone. */
export type MuxUIDateValue = string;
/** A local clock time as an ISO string, `HH:mm`, with no date, time zone, or offset. */
export type MuxUITimeValue = string;
/** A range of calendar dates, both ends included. */
export interface MuxUIDateRange {
  start: MuxUIDateValue;
  end: MuxUIDateValue;
}
/** The shared control sizes. */
export type ControlSize = 'sm' | 'md' | 'lg';
export interface FieldValidationProps {
  description?: ReactNode;
  /** Shown only while the field is invalid, through the invalid prop or failed validation, and replaces the built-in message; it never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  size?: ControlSize;
  className?: string;
}
export type MuxUIAccessibleName =
  | { label: Exclude<ReactNode, null | undefined | boolean>; 'aria-label'?: never; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label': string; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaAccessibleName =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaLabel = { 'aria-label': string };
export type NamedFieldProps = FieldValidationProps & MuxUIAccessibleName;
/** The native props of a field's inner input. The field owns the rest: its identity, value, change handlers, name, accessible name, and validation state. */
export type FieldInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children' | 'dangerouslySetInnerHTML' | 'slot' | 'type' | 'id' | 'name' | 'value' | 'defaultValue' | 'checked' | 'defaultChecked' | 'disabled' | 'readOnly' | 'required' | 'onChange' | 'onInput' | 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-errormessage' | 'aria-invalid' | 'aria-required' | 'aria-disabled' | 'aria-readonly'>;

// The props each field defines, as one type per family: the catalog's web.react API is derived from
// them (Decision 0031). Each is a type literal, not an interface, so the public props type stays
// assignable to Record<string, unknown>, as it was before the move. The grammar lets a type list its
// members and nothing else, so the members every field shares are written out in each; the
// fields.types.test.tsx test pins them to FieldValidationProps and ControlSize. Each public type
// intersects NamedFieldProps (FieldValidationProps and the accessible name's arms), as it did before
// the move, so a consumer's module augmentation of FieldValidationProps still reaches it; the native
// attributes and the ref stay in its host part.

/**
 * The props Mux UI defines for TextField. The input's native attributes, such as autoComplete,
 * inputMode, maxLength, minLength, pattern, spellCheck, and autoFocus, its id, and its inputRef
 * pass through to the input unchanged.
 */
export type TextFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The text, when the caller controls it. */
  value?: string;
  /** The starting text, when the field controls itself. */
  defaultValue?: string;
  /** Called with the new text each time it changes. */
  onChange?: (value: string) => void;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its text stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits its text with the form. */
  name?: string;
  /** An example value shown while the field is empty. It does not name the field. */
  placeholder?: string;
  /** The kind of text the input takes, which sets the keyboard and the browser's checks. */
  type?: 'text' | 'email' | 'password' | 'url' | 'tel';
  /** Native props for the inner input, such as keyboard, paste, focus, and selection handlers, and a className that merges with Mux UI's. The field owns its value, name, type, accessible name, validation, disabled, readOnly, and required, so inputProps cannot replace them. */
  inputProps?: FieldInputProps;
};

export type TextFieldProps = Omit<TextFieldOwnProps, 'label'> & {
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoComplete?: InputHTMLAttributes<HTMLInputElement>['autoComplete'];
  autoFocus?: InputHTMLAttributes<HTMLInputElement>['autoFocus'];
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: InputHTMLAttributes<HTMLInputElement>['maxLength'];
  minLength?: InputHTMLAttributes<HTMLInputElement>['minLength'];
  pattern?: InputHTMLAttributes<HTMLInputElement>['pattern'];
  spellCheck?: InputHTMLAttributes<HTMLInputElement>['spellCheck'];
} & NamedFieldProps;

/**
 * The props Mux UI defines for SearchField. The input's id and inputRef pass through to
 * the input unchanged.
 */
export type SearchFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The text, when the caller controls it. */
  value?: string;
  /** The starting text, when the field controls itself. */
  defaultValue?: string;
  /** Called with the new text each time it changes, including the empty string when Escape or the clear button empties the field. */
  onChange?: (value: string) => void;
  /** Called with the current text when Enter is pressed, including an empty string. A read-only field does not submit. */
  onSubmit?: (value: string) => void;
  /** Called after Escape or the clear button empties a field that had text. */
  onClear?: () => void;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its text stays visible and focusable but cannot be changed, submitted, or cleared. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits its text with the form. */
  name?: string;
  /** An example value shown while the field is empty. It does not name the field. */
  placeholder?: string;
  /** Native props for the inner input, such as keyboard, paste, focus, and selection handlers, and a className that merges with Mux UI's. The field owns its value, name, type, accessible name, validation, disabled, readOnly, and required, so inputProps cannot replace them. */
  inputProps?: FieldInputProps;
};

export type SearchFieldProps = Omit<SearchFieldOwnProps, 'label'> & { id?: string; inputRef?: Ref<HTMLInputElement> } & NamedFieldProps;

/** The props Mux UI defines for NumberField. */
export type NumberFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The number, when the caller controls it. NaN keeps the field empty. */
  value?: number;
  /** The starting number, when the field controls itself. */
  defaultValue?: number;
  /** Called with the new number each time it is committed, and with NaN when the field is cleared. */
  onChange?: (value: number) => void;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its number stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The smallest value. A typed value below it is raised to it when committed. */
  minValue?: number;
  /** The largest value. A typed value above it is lowered to it when committed. */
  maxValue?: number;
  /** How much the steppers and arrow keys change the value, and the step a typed value is rounded to when committed. */
  step?: number;
  /** The form field name. A named field submits the plain number, or an empty string while it is empty. */
  name?: string;
  /** How the number is shown, as Intl.NumberFormat options such as currency or percent. It changes only the displayed text: the field reports and submits plain numbers. */
  formatOptions?: Intl.NumberFormatOptions;
};

export type NumberFieldProps = Omit<NumberFieldOwnProps, 'label'> & NamedFieldProps;

/** The props Mux UI defines for CheckboxGroup. The checkboxes are its children. */
export type CheckboxGroupOwnProps = {
  /** The visible label, which also names the group. Without one, the group needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the group, which also describes it. */
  description?: ReactNode;
  /** The message the group shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the group invalid by itself. */
  errorMessage?: ReactNode;
  /** The values of the checked options, when the caller controls them. */
  value?: string[];
  /** The values of the options that start checked, when the group controls itself. */
  defaultValue?: string[];
  /** Called with the values of all the checked options each time one changes. */
  onChange?: (value: string[]) => void;
  /** Disables the group and every option in it. */
  disabled?: boolean;
  /** Makes the group read-only: its options stay visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the group required, so a form with native validation does not submit while no option is checked. */
  required?: boolean;
  /** Marks the group invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the group invalid. */
  invalid?: boolean;
  /** The form field name, applied to every option. Checked values arrive as repeated entries under it. */
  name?: string;
  /** Whether the options stack in a column or sit in a row. The options take it from the group. */
  orientation?: 'vertical' | 'horizontal';
  /** The control size. The options take it from the group. */
  size?: 'sm' | 'md' | 'lg';
};

export type CheckboxGroupProps = Omit<CheckboxGroupOwnProps, 'label'> & { children?: ReactNode } & NamedFieldProps;

/** The props Mux UI defines for Switch. */
export type SwitchOwnProps = {
  /** The visible label, which also names the Switch. Without one, the Switch needs an aria-label or aria-labelledby, and children do not count as a name. When both label and children are given, label is shown. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the Switch, which also describes it. */
  description?: ReactNode;
  /** The message the Switch shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the Switch invalid by itself. */
  errorMessage?: ReactNode;
  /** Whether the Switch is on, when the caller controls it. */
  selected?: boolean;
  /** Whether the Switch starts on, when it controls itself. */
  defaultSelected?: boolean;
  /** Called with the new on or off state each time it changes. */
  onChange?: (selected: boolean) => void;
  /** Disables the Switch: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the Switch read-only: its state stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the Switch required, so a form with native validation does not submit while it is off. */
  required?: boolean;
  /** Marks the Switch invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the Switch invalid. */
  invalid?: boolean;
  /** The form field name. A named Switch submits its value while it is on. */
  name?: string;
  /** What a named Switch submits while it is on. */
  value?: string;
};

export type SwitchProps = Omit<SwitchOwnProps, 'label'> & { children?: ReactNode; className?: string } & MuxUIAccessibleName;

/** Messages for the fields of a Form, keyed by field name. Each value is one message or several. */
export type MuxUIValidationErrors = { readonly [key: string]: string | string[] };

/**
 * The props Mux UI defines for Form. Its native form attributes and events, such as method,
 * action, onSubmit, and onReset, pass through to the form element unchanged.
 */
export interface FormOwnProps {
  /** When fields show built-in validation errors. With native, the browser checks each field's rules, such as required and type, when the form is submitted, and a failing field stops the submit. With aria, those rules show no error and stop no submit, so the application decides when a field is invalid. */
  validationBehavior?: 'aria' | 'native';
  /** Errors from the application or a server, keyed by field name, each one message or an array of messages. A field shows its errors at once, and editing it or resetting the form dismisses them until a new object arrives. */
  validationErrors?: MuxUIValidationErrors;
}

export interface FormProps extends FormOwnProps, Omit<FormHTMLAttributes<HTMLFormElement>, keyof FormOwnProps | 'children' | 'className' | 'onSubmit' | 'onReset'> {
  children?: ReactNode;
  className?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onReset?: FormEventHandler<HTMLFormElement>;
}

/** The props Mux UI defines for DateField. */
export type DateFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The date as YYYY-MM-DD, when the caller controls it. null keeps a controlled field empty. Any other string throws a TypeError. */
  value?: MuxUIDateValue | null;
  /** The starting date as YYYY-MM-DD, when the field controls itself. */
  defaultValue?: MuxUIDateValue;
  /** Called with the new date as YYYY-MM-DD, or with null when the field is cleared. */
  onChange?: (value: MuxUIDateValue | null) => void;
  /** The earliest date, inclusive. A value before it stays visible and invalid. A minValue later than maxValue throws a TypeError. */
  minValue?: MuxUIDateValue;
  /** The latest date, inclusive. A value after it stays visible and invalid. */
  maxValue?: MuxUIDateValue;
  /** Returns true for a date that is unavailable, given as a YYYY-MM-DD string. An unavailable date is invalid. */
  unavailableDateMatcher?: (date: MuxUIDateValue) => boolean;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its date stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits YYYY-MM-DD, or an empty string while it is empty. */
  name?: string;
};

export type DateFieldProps = Omit<DateFieldOwnProps, 'label'> & NamedFieldProps;

/** The props Mux UI defines for TimeField. */
export type TimeFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The time as HH:mm, when the caller controls it. HH:mm:ss and HH:mm:ss.fraction are accepted with their seconds ignored. null keeps a controlled field empty. Any other string throws a TypeError. */
  value?: MuxUITimeValue | null;
  /** The starting time, when the field controls itself, in the formats value accepts. */
  defaultValue?: MuxUITimeValue;
  /** Called with the new time as HH:mm, or with null when the field is cleared. */
  onChange?: (value: MuxUITimeValue | null) => void;
  /** The earliest time, inclusive, in the formats value accepts. A value before it stays visible and invalid. A minValue later than maxValue throws a TypeError. */
  minValue?: MuxUITimeValue;
  /** The latest time, inclusive, in the formats value accepts. A value after it stays visible and invalid. */
  maxValue?: MuxUITimeValue;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its time stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits HH:mm, or an empty string while it is empty. */
  name?: string;
};

/** TimeField works at minute precision: HH:mm:ss values and bounds are accepted, their seconds are ignored, and values submit and emit as HH:mm. */
export type TimeFieldProps = Omit<TimeFieldOwnProps, 'label'> & NamedFieldProps;

/** The props Mux UI defines for DatePicker. */
export type DatePickerOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The date as YYYY-MM-DD, when the caller controls it. null keeps a controlled field empty. Any other string throws a TypeError. */
  value?: MuxUIDateValue | null;
  /** The starting date as YYYY-MM-DD, when the field controls itself. */
  defaultValue?: MuxUIDateValue;
  /** Called with the new date as YYYY-MM-DD, or with null when the field is cleared. */
  onChange?: (value: MuxUIDateValue | null) => void;
  /** Called with the new open state when the calendar opens or closes, including when choosing a date closes it. */
  onOpenChange?: (open: boolean) => void;
  /** The earliest date, inclusive. A value before it stays visible and invalid. A minValue later than maxValue throws a TypeError. */
  minValue?: MuxUIDateValue;
  /** The latest date, inclusive. A value after it stays visible and invalid. */
  maxValue?: MuxUIDateValue;
  /** Returns true for a date that is unavailable, given as a YYYY-MM-DD string. An unavailable date cannot be chosen in the calendar. */
  unavailableDateMatcher?: (date: MuxUIDateValue) => boolean;
  /** Whether the calendar is open, when the caller controls it. It is independent of the date: controlling one does not control the other. */
  open?: boolean;
  /** Whether the calendar starts open, when the picker controls itself. Omitted, it starts closed unless a React Aria context supplies defaultOpen. */
  defaultOpen?: boolean;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its date stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits YYYY-MM-DD, or an empty string while it is empty. */
  name?: string;
};

export type DatePickerProps = Omit<DatePickerOwnProps, 'label'> & NamedFieldProps;

/** The props Mux UI defines for DateRangePicker. */
export type DateRangePickerOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The range as start and end YYYY-MM-DD strings, when the caller controls it. null keeps a controlled field empty. A range missing either end throws a TypeError, and one whose end is before its start is kept as given and is invalid. */
  value?: MuxUIDateRange | null;
  /** The starting range, when the field controls itself, as a complete pair of YYYY-MM-DD strings. */
  defaultValue?: MuxUIDateRange;
  /** Called with the new range as YYYY-MM-DD strings, or with null when the field is cleared. */
  onChange?: (value: MuxUIDateRange | null) => void;
  /** Called with the new open state when the calendar opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** The earliest date, inclusive. A date before it stays visible and invalid. A minValue later than maxValue throws a TypeError. */
  minValue?: MuxUIDateValue;
  /** The latest date, inclusive. A date after it stays visible and invalid. */
  maxValue?: MuxUIDateValue;
  /** Returns true for a date that cannot be chosen. It receives the date being checked and the anchor, the start date chosen so far or null before a start is chosen, both as YYYY-MM-DD strings. Selection stays contiguous, so a range cannot cross an unavailable date. */
  unavailableDateMatcher?: (date: MuxUIDateValue, anchorDate: MuxUIDateValue | null) => boolean;
  /** Whether the calendar is open, when the caller controls it. It is independent of the range: controlling one does not control the other. */
  open?: boolean;
  /** Whether the calendar starts open, when the picker controls itself. Omitted, it starts closed unless a React Aria context supplies defaultOpen. */
  defaultOpen?: boolean;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** Makes the field read-only: its range stays visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name of the start date. It submits YYYY-MM-DD, or an empty string while the range is empty. */
  startName?: string;
  /** The form field name of the end date. It submits YYYY-MM-DD, or an empty string while the range is empty. */
  endName?: string;
};

export type DateRangePickerProps = Omit<DateRangePickerOwnProps, 'label'> & NamedFieldProps;

/** One suggestion. */
export interface AutocompleteItem {
  /** Identifies the suggestion. Without one, a record takes its value, or else its position, as one. */
  id?: string;
  /** What the list and the input show. Without one, a record shows its value, or else its id. */
  label?: ReactNode;
  /** What the form and onChange receive when the suggestion is chosen. Without one, a record submits its id, or, with no id either, its label's text. */
  value?: string;
  /** Skips the suggestion in selection. */
  disabled?: boolean;
}

/** The suggestion onSelect receives, with each field filled in. */
export interface AutocompleteSelectionItem {
  id: string;
  label: ReactNode;
  value: string;
}

/**
 * The props Mux UI defines for Autocomplete. The input's accessible name can be an aria-label or
 * aria-labelledby when there is no label.
 */
export type AutocompleteOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed native, custom, or server validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The submitted value, when the caller controls it. The input shows a matching item's label. */
  value?: string;
  /** The starting value, when the field controls itself. */
  defaultValue?: string;
  /** Called with the new value each time the text changes or a suggestion is chosen. A chosen suggestion reports its value, not its label. */
  onChange?: (value: string) => void;
  /** Called when a suggestion is chosen, with the chosen item. */
  onSelect?: (item?: AutocompleteSelectionItem) => void;
  /** Disables the field: it can be neither focused nor changed. */
  disabled?: boolean;
  /** The control size. The suggestion list takes it too. */
  size?: 'sm' | 'md' | 'lg';
  /** Makes the field read-only: its text stays visible and focusable but cannot be changed, and no suggestion can be chosen. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The form field name. A named field submits the chosen suggestion's value, or the typed text when nothing was chosen. */
  name?: string;
  /** The suggestions, as strings or records. A string is shown and submitted as its text. Typing filters them by their text. */
  items?: (AutocompleteItem | string)[];
  /** An example value shown while the field is empty. It does not name the field. */
  placeholder?: string;
};

export type AutocompleteProps = Omit<AutocompleteOwnProps, 'label'> & NamedFieldProps;

// React Aria props that a Mux UI field does not publish. The wrappers destructure them so a value
// an untyped caller passes never reaches React Aria through the rest spread.
type DiscardedFieldProps = { validationBehavior?: unknown };
type DiscardedDateProps = DiscardedFieldProps & { isDateUnavailable?: unknown };
type DiscardedDateRangeProps = DiscardedDateProps & { allowsNonContiguousRanges?: unknown; closeOnSelect?: unknown; shouldCloseOnSelect?: unknown };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/u;
const TIME_PLACEHOLDER = /*#__PURE__*/ parseTime('00:00');
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const MUX_RUNTIME_SCOPE_SELECTOR = /*#__PURE__*/ [
  '[data-muxui-color-scheme]',
  '[data-muxui-contrast]',
  '[data-muxui-motion]',
  '[data-muxui-density]',
  '[data-muxui-direction]',
].join(', ');

function autocompletePortalContainer(input: Element | null) {
  if (typeof document === 'undefined' || !input) return undefined;
  const scope = input.closest(MUX_RUNTIME_SCOPE_SELECTOR);
  if (!scope || scope === document.documentElement || scope === document.body) return undefined;
  return scope;
}

function classNames(base: string | undefined, className?: unknown) {
  return [base, className].filter(Boolean).join(' ');
}

function readTransform(node: Element) {
  if (typeof window === 'undefined') return 'none';
  return window.getComputedStyle(node).transform || 'none';
}

interface SwitchMotionIndicatorProps {
  isSelected: boolean;
  isPressed: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
}

function SwitchMotionIndicator({ isSelected, isPressed, isDisabled, isReadOnly }: SwitchMotionIndicatorProps) {
  const indicatorRef = React.useRef<HTMLSpanElement>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const settledTransformRef = React.useRef<string | null>(null);
  const previousStateRef = React.useRef<{ isSelected: boolean; isPressed: boolean; blocked: boolean } | null>(null);
  const [reduced, setReduced] = React.useState(false);
  const blocked = isDisabled || isReadOnly;

  useIsomorphicLayoutEffect(() => () => {
    const controls = controlsRef.current;
    controlsRef.current = null;
    controls?.stop();
    indicatorRef.current?.style.removeProperty('transform');
  }, []);

  React.useEffect(() => {
    const node = indicatorRef.current;
    if (!node) return undefined;
    return observeReducedMotion(node, node.parentElement, (nextReduced) => {
      setReduced(nextReduced);
      if (!nextReduced) return;
      const controls = controlsRef.current;
      controlsRef.current = null;
      controls?.cancel();
      node.style.removeProperty('transform');
      settledTransformRef.current = readTransform(node);
    });
  }, []);

  useIsomorphicLayoutEffect(() => {
    const node = indicatorRef.current;
    if (!node) return undefined;
    const nextState = {
      isSelected: Boolean(isSelected),
      isPressed: Boolean(isPressed),
      blocked: Boolean(blocked),
    };
    const previousState = previousStateRef.current;
    previousStateRef.current = nextState;
    if (!previousState) {
      settledTransformRef.current = readTransform(node);
      return undefined;
    }

    const controls = controlsRef.current;
    const interruptedTransform = controls ? readTransform(node) : settledTransformRef.current;
    controlsRef.current = null;
    controls?.stop();
    node.style.removeProperty('transform');

    if (reduced || blocked) {
      settledTransformRef.current = readTransform(node);
      return undefined;
    }

    const targetTransform = readTransform(node);
    const fromTransform = interruptedTransform || targetTransform;
    settledTransformRef.current = targetTransform;
    if (fromTransform === targetTransform) return undefined;

    const transition = resolvedMotionSpring(node, node.parentElement, 'state', 'interaction');
    if (!transition) return undefined;

    node.style.transform = fromTransform;
    let active = true;
    const complete = () => {
      if (!active || controlsRef.current !== nextControls) return;
      requestAnimationFrame(() => {
        if (!active || controlsRef.current !== nextControls) return;
        controlsRef.current = null;
        node.style.removeProperty('transform');
        settledTransformRef.current = targetTransform;
      });
    };
    const nextControls = animate(node, { transform: [fromTransform, targetTransform] }, transition);
    controlsRef.current = nextControls;
    nextControls.then(() => {
      complete();
    });

    return () => {
      active = false;
      if (controlsRef.current !== nextControls) return;
      settledTransformRef.current = readTransform(node);
      controlsRef.current = null;
      nextControls.stop();
    };
  }, [blocked, isPressed, isSelected, reduced]);

  return React.createElement('span', {
    ref: indicatorRef,
    className: 'muxui-switch-indicator',
    'aria-hidden': 'true',
    'data-muxui-state-selected': isSelected || undefined,
    'data-muxui-motion-pressed': isPressed && !blocked && !reduced ? '' : undefined,
  });
}

// TextField and SearchField own the field semantics and their serialized value.
// Keep those props on the RAC field context while allowing native behavior on
// the inner input through the bounded inputProps escape hatch.
// FieldInputProps omits these, less ref: the grammar cannot read its Omit's keys, so a test ties the two.
const FIELD_INPUT_PROTECTED_PROPS = new Set<string>([
  'ref',
  'children',
  'dangerouslySetInnerHTML',
  'slot',
  'type',
  'id',
  'name',
  'value',
  'defaultValue',
  'checked',
  'defaultChecked',
  'disabled',
  'readOnly',
  'required',
  'onChange',
  'onInput',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-errormessage',
  'aria-invalid',
  'aria-required',
  'aria-disabled',
  'aria-readonly',
]);

// What a field sets on its inner input itself, over the caller's inputProps.
type FieldInputOwnedProps = Pick<InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'autoComplete' | 'autoFocus' | 'inputMode' | 'maxLength' | 'minLength' | 'pattern' | 'spellCheck' | 'type'> & { ref?: Ref<HTMLInputElement> };

function fieldInputProps(inputProps: FieldInputProps | undefined, ownedProps: FieldInputOwnedProps) {
  const nativeProps: FieldInputProps & Record<string, unknown> = inputProps && typeof inputProps === 'object' ? { ...inputProps } : {};
  for (const prop of FIELD_INPUT_PROTECTED_PROPS) delete nativeProps[prop];
  const { className, ...rest } = nativeProps;
  return {
    ...rest,
    ...ownedProps,
    className: classNames('muxui-field-input', className),
  };
}

function optionalInputProps(entries: FieldInputOwnedProps): FieldInputOwnedProps {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

const FieldInput = React.forwardRef<HTMLInputElement, AriaInputProps>(function FieldInput({ onKeyDown, ...props }, ref) {
  // RAC's field components provide a plain props object here, not a slotted one.
  const { onKeyDown: handleFieldKeyDown, ...inputContext } = React.useContext(AriaInputContext) as AriaInputProps;
  // Let native input handlers cancel field shortcuts before they submit or clear.
  return React.createElement(AriaInputContext.Provider, { value: inputContext }, React.createElement(AriaInput, {
    ...props,
    ref,
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      onKeyDown?.(event);
      if (!event.defaultPrevented) handleFieldKeyDown?.(event);
    },
  }));
});

// NumberField's steppers take their accessible names from React Aria's button context, by slot, which
// IconButton reads there; its types ask for a name on the element itself.
const StepperButton = IconButton as ForwardRefExoticComponent<Omit<IconButtonProps, 'aria-label' | 'aria-labelledby'> & RefAttributes<HTMLButtonElement>>;

function fieldLabel(label: ReactNode) {
  return label === undefined || label === null ? null : React.createElement(AriaLabel, { className: 'muxui-field-label' }, label);
}

function assertAccessibleName({ label, ariaLabel, ariaLabelledby }: { label?: ReactNode; ariaLabel?: string; ariaLabelledby?: string }, componentName: string) {
  if ((label === undefined || label === null || label === false || label === '') && !ariaLabel && !ariaLabelledby) {
    throw new TypeError(`${componentName} requires label, aria-label, or aria-labelledby`);
  }
}

function fieldDescription(description: ReactNode) {
  return description === undefined ? null : React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description);
}

function fieldError(errorMessage: ReactNode) {
  return React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage);
}

// Keep the calendar geometry Mux UI-owned instead of importing a newer glyph.
function calendarGlyph() {
  return React.createElement('svg', {
    className: 'muxui-icon muxui-icon--sm',
    'aria-hidden': 'true',
    focusable: 'false',
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    width: 24,
    height: 24,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', { d: 'M8 2v4' }),
  React.createElement('path', { d: 'M16 2v4' }),
  React.createElement('rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }),
  React.createElement('path', { d: 'M3 10h18' }));
}

interface FieldChildrenParts {
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  children?: ReactNode;
  input?: ReactNode;
}

function fieldChildren({ label, description, errorMessage, children, input }: FieldChildrenParts) {
  return React.createElement(React.Fragment, null,
    fieldLabel(label),
    input,
    children,
    fieldDescription(description),
    fieldError(errorMessage),
  );
}

// RAC's named validation context covers its own field serialization. These
// wrappers keep their Mux-owned hidden inputs, so they need the same external
// errors without forwarding names into RAC and creating duplicate values.
const MuxFormValidationContext = React.createContext<MuxUIValidationErrors | null>(null);

function normalizeValidationMessages(value: string | string[] | undefined | null) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value])
    .filter((message) => message !== undefined && message !== null)
    .map(String);
}

// Like RAC's server errors, an edit or reset dismisses the current errors
// until the Form receives a new validationErrors object.
function useMuxFormValidation(names: string | undefined | (string | undefined)[]) {
  const validationErrors = React.useContext(MuxFormValidationContext);
  const [dismissedErrors, setDismissedErrors] = React.useState<MuxUIValidationErrors | null>(null);
  const messages = dismissedErrors === validationErrors ? [] : (Array.isArray(names) ? names : [names]).flatMap((name) => {
    if (!name || !validationErrors || !Object.prototype.hasOwnProperty.call(validationErrors, name)) return [];
    return normalizeValidationMessages(validationErrors[name]);
  });
  return { isInvalid: messages.length > 0, message: messages.join(' '), dismiss: () => setDismissedErrors(validationErrors) };
}

// errorMessage only customizes the message RAC's FieldError shows while the
// field is invalid; it never makes the field invalid on its own.
function validationProps({ disabled, readOnly, required, invalid }: { disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean }) {
  return {
    isDisabled: disabled,
    isReadOnly: readOnly,
    isRequired: required,
    // Leave invalid uncontrolled unless forced so native, custom, and Form's
    // name-keyed server validation can flow through RAC's context.
    isInvalid: invalid ? true : undefined,
  };
}

function parseDateValue(value: MuxUIDateValue) {
  const message = 'Mux UI date values must use YYYY-MM-DD ISO format';
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new TypeError(message);
  try {
    return parseDate(value);
  } catch {
    throw new TypeError(message);
  }
}

function dateOrUndefined(value: MuxUIDateValue | null | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseDateValue(value);
}

// TimeField works at minute precision: HH:mm:ss input is accepted (as
// database time columns produce) and its seconds are dropped, so values,
// bounds, display, and submission all compare at the same precision.
function timeOrUndefined(value: MuxUITimeValue | null | undefined) {
  if (value === undefined || value === null || value === '') return undefined;
  const message = 'Mux UI time values must use HH:mm[:ss[.fraction]] ISO format';
  if (typeof value !== 'string' || !ISO_TIME_PATTERN.test(value)) throw new TypeError(message);
  let time: Time;
  try {
    time = parseTime(value);
  } catch {
    throw new TypeError(message);
  }
  return time.set({ second: 0, millisecond: 0 });
}

function dateRangeOrUndefined(value: MuxUIDateRange | null | undefined) {
  if (value === undefined || value === null) return undefined;
  const message = 'Mux UI date ranges must include start and end ISO dates';
  if (typeof value !== 'object' || Array.isArray(value) || value.start === undefined || value.start === null || value.start === '' || value.end === undefined || value.end === null || value.end === '') {
    throw new TypeError(message);
  }
  return { start: parseDateValue(value.start), end: parseDateValue(value.end) };
}

// RAC treats an undefined value as uncontrolled, so a cleared controlled
// field (null or '') must reach it as null to stay controlled and empty.
function controlledTemporal<Value, Parsed>(value: Value | undefined, parse: (value: Value) => Parsed | undefined) {
  return value === undefined ? undefined : parse(value) ?? null;
}

function assertTemporalBounds<Bound extends { compare(other: Bound): number }>(minValue: Bound | undefined, maxValue: Bound | undefined, valueName: string) {
  if (minValue && maxValue && minValue.compare(maxValue) > 0) {
    throw new TypeError(`Mux UI ${valueName} minValue must be less than or equal to maxValue`);
  }
}

function dateBounds(minValue: MuxUIDateValue | undefined, maxValue: MuxUIDateValue | undefined) {
  const parsedMinValue = dateOrUndefined(minValue);
  const parsedMaxValue = dateOrUndefined(maxValue);
  assertTemporalBounds(parsedMinValue, parsedMaxValue, 'date');
  return { minValue: parsedMinValue, maxValue: parsedMaxValue };
}

function timeBounds(minValue: MuxUITimeValue | undefined, maxValue: MuxUITimeValue | undefined) {
  const parsedMinValue = timeOrUndefined(minValue);
  const parsedMaxValue = timeOrUndefined(maxValue);
  assertTemporalBounds(parsedMinValue, parsedMaxValue, 'time');
  return { minValue: parsedMinValue, maxValue: parsedMaxValue };
}

function unavailableDateCallback(callback: ((date: MuxUIDateValue) => boolean) | undefined) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') throw new TypeError('unavailableDateMatcher must be a function');
  return (date: DateValue) => callback(String(date));
}

function unavailableDateRangeCallback(callback: ((date: MuxUIDateValue, anchorDate: MuxUIDateValue | null) => boolean) | undefined) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') throw new TypeError('unavailableDateMatcher must be a function');
  return (date: DateValue, anchorDate?: DateValue | null) => callback(String(date), anchorDate ? String(anchorDate) : null);
}

function serializeDateValue(value: DateValue): string;
function serializeDateValue(value: DateValue | null | undefined): string | null;
function serializeDateValue(value: DateValue | null | undefined) {
  return value ? String(value) : null;
}

// Submit and emit times at TimeField's minute precision as HH:mm.
function serializeTimeValue(value: TimeValue | null | undefined) {
  return value ? String(value).slice(0, 5) : null;
}

// React Aria's types make the children of some components a required prop. createElement sets that
// prop from the children it takes after the props, so the props carry only this placeholder.
const CHILDREN_FOLLOW = undefined;

// RAC's collection children are render functions its types do not take as extra createElement
// arguments, so they go in the children prop; a React element's children are the same either way.
function calendarChildren(cellClass = 'muxui-calendar-cell') {
  const grid = React.createElement(CalendarHeightMotion, null, React.createElement(AriaCalendarGrid, { className: 'muxui-calendar-grid' },
    React.createElement(AriaCalendarGridHeader, {
      className: 'muxui-calendar-grid-header',
      children: (day) => React.createElement(AriaCalendarHeaderCell, { className: 'muxui-calendar-header-cell' }, day),
    }),
    React.createElement(AriaCalendarGridBody, {
      className: 'muxui-calendar-grid-body',
      children: (date) => React.createElement(AriaCalendarCell, { date, className: cellClass, ...{ 'data-muxui-date': cellClass === 'muxui-range-calendar-cell' ? String(date) : undefined } }),
    }),
  ));
  return cellClass === 'muxui-range-calendar-cell' ? React.createElement(RangeSelectionMotion, null, grid) : grid;
}

function calendarHeader() {
  return React.createElement('div', { className: 'muxui-calendar-header' },
    React.createElement(IconButton, { slot: 'previous', 'aria-label': 'Previous month', className: 'muxui-calendar-previous' }, React.createElement(ChevronLeftIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })),
    React.createElement(AriaCalendarHeading, { className: 'muxui-calendar-heading' }),
    React.createElement(IconButton, { slot: 'next', 'aria-label': 'Next month', className: 'muxui-calendar-next' }, React.createElement(ChevronRightIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })));
}

function datePopover() {
  return React.createElement(DatePopoverMotion, { ownerClassName: 'muxui-date-picker-popover' }, React.createElement(AriaDialog, { className: 'muxui-date-dialog' }, React.createElement(AriaCalendar, { className: 'muxui-calendar' }, calendarHeader(), calendarChildren())));
}

function rangeDatePopover(triggerRef: RefObject<Element | null>) {
  return React.createElement(DatePopoverMotion, { placement: 'bottom end', triggerRef, ownerClassName: 'muxui-date-range-picker-popover' }, React.createElement(AriaDialog, { className: 'muxui-date-dialog' }, React.createElement(AriaRangeCalendar, { className: 'muxui-calendar' }, calendarHeader(), calendarChildren('muxui-range-calendar-cell'))));
}

function dateInput() {
  return React.createElement(AriaDateInput, {
    className: 'muxui-date-input',
    children: (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' }),
  });
}

// RAC 1.20 owns form reset for most fields, but not TimeField and the
// range serialization below. Attach one listener to the component's owning
// form so multiple forms/components remain isolated and teardown is exact.
// Capture blocks intermediate RAC changes; the callback waits for consumer
// onReset handlers to finish before checking cancellation.
function useOwningFormReset(onReset: () => void, onResetStart: () => void, onResetEnd: () => void) {
  const callbackRef = React.useRef(onReset);
  const resetStartRef = React.useRef(onResetStart);
  const resetEndRef = React.useRef(onResetEnd);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const listenerRef = React.useRef<((event: Event) => void) | null>(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  resetStartRef.current = onResetStart;
  resetEndRef.current = onResetEnd;
  return React.useCallback((node: HTMLInputElement | null) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) {
      formRef.current.removeEventListener('reset', listenerRef.current, true);
    }
    formRef.current = nextForm;
    listenerRef.current = null;
    if (nextForm) {
      const listener = (event: Event) => {
        const resetToken = ++resetTokenRef.current;
        resetStartRef.current?.();
        Promise.resolve().then(() => {
          if (resetTokenRef.current !== resetToken) return;
          resetEndRef.current?.();
          if (!event.defaultPrevented && formRef.current === nextForm && listenerRef.current === listener) callbackRef.current();
        });
      };
      listenerRef.current = listener;
      nextForm.addEventListener('reset', listener, true);
    }
  }, []);
}

function formResetAnchor(ref: Ref<HTMLInputElement>) {
  return React.createElement('input', {
    ref,
    type: 'hidden',
    disabled: true,
    tabIndex: -1,
    className: 'muxui-form-reset-anchor',
    'aria-hidden': 'true',
  });
}

export const TextField: ForwardRefExoticComponent<TextFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, TextFieldProps & DiscardedFieldProps>(function TextField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  size = 'md',
  validationBehavior: _validationBehavior,
  name,
  placeholder,
  type = 'text',
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  autoComplete,
  autoFocus,
  inputMode,
  maxLength,
  minLength,
  pattern,
  spellCheck,
  inputRef,
  inputProps,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'TextField');
  const resolvedSize = normalizeChoiceControlSize(size, 'TextField');
  return React.createElement(AriaTextField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid }),
    value,
    defaultValue,
    onChange,
    name,
    className: classNames('muxui-text-field', className),
    ...{ 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(FieldInput, {
      ...fieldInputProps(inputProps, {
        ...optionalInputProps({ placeholder, autoComplete, autoFocus, inputMode, maxLength, minLength, pattern, spellCheck }),
        type,
        ref: inputRef,
      }),
    }),
  }));
});

TextField.displayName = 'TextField';

export const SearchField: ForwardRefExoticComponent<SearchFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, SearchFieldProps & DiscardedFieldProps>(function SearchField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  onSubmit,
  onClear,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  size = 'md',
  validationBehavior: _validationBehavior,
  name,
  placeholder,
  inputRef,
  inputProps,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'SearchField');
  const resolvedSize = normalizeChoiceControlSize(size, 'SearchField');
  return React.createElement(AriaSearchField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid }),
    value,
    defaultValue,
    onChange,
    onSubmit,
    // RAC fires onClear for both Escape and the clear button.
    onClear,
    name,
    className: classNames('muxui-search-field', className),
    ...{ 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement('div', { className: 'muxui-search-control' },
      React.createElement(FieldInput, {
        ...fieldInputProps(inputProps, {
          ...optionalInputProps({ placeholder }),
          ref: inputRef,
        }),
      }),
      React.createElement(IconButton, { slot: 'clear', type: 'button', className: 'muxui-search-clear', 'aria-label': 'Clear search' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 14 }))),
  }));
});

SearchField.displayName = 'SearchField';

export const NumberField: ForwardRefExoticComponent<NumberFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, NumberFieldProps & DiscardedFieldProps>(function NumberField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  size = 'md',
  validationBehavior: _validationBehavior,
  name,
  minValue,
  maxValue,
  step = 1,
  formatOptions,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'NumberField');
  const resolvedSize = normalizeChoiceControlSize(size, 'NumberField');
  return React.createElement(AriaNumberField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid }),
    value,
    defaultValue,
    onChange,
    name,
    minValue,
    maxValue,
    step,
    formatOptions,
    className: classNames('muxui-number-field', className),
    ...{ 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(AriaGroup, { className: 'muxui-number-control' },
      React.createElement(StepperButton, { slot: 'decrement', type: 'button', className: 'muxui-number-stepper muxui-number-stepper-decrement' }, React.createElement(MinusIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })),
      React.createElement(AriaInput, { className: 'muxui-field-input' }),
      React.createElement(StepperButton, { slot: 'increment', type: 'button', className: 'muxui-number-stepper muxui-number-stepper-increment' }, React.createElement(PlusIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
  }));
});

NumberField.displayName = 'NumberField';

export const CheckboxGroup: ForwardRefExoticComponent<CheckboxGroupProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, CheckboxGroupProps & DiscardedFieldProps>(function CheckboxGroup({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  onChange,
  disabled = false,
  orientation = 'vertical',
  size = 'md',
  readOnly = false,
  required = false,
  invalid = false,
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  children,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'CheckboxGroup');
  if (orientation !== 'horizontal' && orientation !== 'vertical') {
    throw new TypeError('CheckboxGroup orientation must be horizontal or vertical');
  }
  const resolvedSize = normalizeChoiceControlSize(size, 'CheckboxGroup');
  const labelId = React.useId();
  const hasLabel = label !== undefined && label !== null;
  const group = React.createElement(AriaCheckboxGroup, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid }),
    value,
    defaultValue,
    onChange,
    // RAC carries this through CheckboxGroupStateContext to every descendant
    // checkbox, including fragments and wrapper components.
    name,
    className: classNames('muxui-checkbox-group', className),
    ...{ 'data-muxui-state-orientation': orientation, 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    // The visible label sits outside the options' flex layout, so name the
    // group by id rather than through RAC's label slot.
    'aria-labelledby': ariaLabelledby ?? (hasLabel ? labelId : undefined),
  }, children, fieldDescription(description), fieldError(errorMessage));
  const field = React.createElement('div', { className: 'muxui-checkbox-group-field' },
    hasLabel ? React.createElement(AriaLabel, { id: labelId, elementType: 'span', className: 'muxui-field-label' }, label) : null,
    group,
  );
  return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, field);
});

CheckboxGroup.displayName = 'CheckboxGroup';

// Pure wrapping lets root-barrel consumers drop Switch's private motion edge.
export const Switch: ForwardRefExoticComponent<SwitchProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, SwitchProps & DiscardedFieldProps>(function Switch({
    label,
    children,
    selected,
    defaultSelected = false,
    onChange,
    disabled = false,
    readOnly = false,
    description,
    errorMessage,
    required = false,
    invalid = false,
    size = 'md',
    validationBehavior: _validationBehavior,
    name,
    value,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...props
  }, ref) {
    assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'Switch');
    const resolvedSize = normalizeChoiceControlSize(size, 'Switch');
    const visibleLabel = label === undefined || label === null ? children : label;
    return React.createElement(AriaSwitchField, {
      ...props,
      ref,
      ...validationProps({ disabled, readOnly, required, invalid }),
      isSelected: selected,
      defaultSelected,
      name,
      value,
      className: classNames('muxui-switch-field', className),
      ...{ 'data-muxui-size': resolvedSize },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      onChange,
    }, React.createElement(AriaSwitchButton, {
      className: 'muxui-switch',
      children: ({ isSelected, isPressed, isDisabled, isReadOnly }) => React.createElement(React.Fragment, null,
        React.createElement(SwitchMotionIndicator, { isSelected, isPressed, isDisabled, isReadOnly }),
        visibleLabel !== undefined && visibleLabel !== null
          ? React.createElement('span', { className: 'muxui-switch-label' }, visibleLabel)
          : null),
    }),
    fieldDescription(description),
    fieldError(errorMessage));
  });
  component.displayName = 'Switch';
  return component;
})();

// React Aria narrows some of a form's native attributes (encType and method to the values the DOM
// accepts), which Form takes from React's form attributes unchanged.
const FormElement = AriaForm as ForwardRefExoticComponent<Omit<AriaFormProps, keyof FormHTMLAttributes<HTMLFormElement>> & FormHTMLAttributes<HTMLFormElement> & RefAttributes<HTMLFormElement>>;

export const Form: ForwardRefExoticComponent<FormProps & RefAttributes<HTMLFormElement>> = React.forwardRef<HTMLFormElement, FormProps>(function Form({
  children,
  className,
  validationBehavior = 'native',
  validationErrors,
  onSubmit,
  onReset,
  ...props
}, ref) {
  return React.createElement(FormElement, {
    ...props,
    ref,
    className: classNames('muxui-form', className),
    validationBehavior,
    validationErrors,
    onSubmit,
    onReset,
  }, React.createElement(MuxFormValidationContext.Provider, { value: validationErrors === undefined || validationErrors === null ? {} : validationErrors }, children));
});

Form.displayName = 'Form';

export const DateField: ForwardRefExoticComponent<DateFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, DateFieldProps & DiscardedDateProps>(function DateField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  minValue,
  maxValue,
  unavailableDateMatcher,
  isDateUnavailable: _upstreamDateUnavailable,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  size = 'md',
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'DateField');
  const resolvedSize = normalizeChoiceControlSize(size, 'DateField');
  const parsedValue = React.useMemo(() => controlledTemporal(value, dateOrUndefined), [value]);
  const parsedDefaultValue = React.useMemo(() => dateOrUndefined(defaultValue), [defaultValue]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
  return React.createElement(AriaDateField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid }),
    value: parsedValue,
    defaultValue: parsedDefaultValue,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    isDateUnavailable: unavailableDateCallback(unavailableDateMatcher),
    onChange: (next) => onChange?.(serializeDateValue(next)),
    name,
    className: classNames('muxui-date-field', className),
    ...{ 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({ label, description, errorMessage, input: dateInput() }));
});

DateField.displayName = 'DateField';

export const TimeField: ForwardRefExoticComponent<TimeFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, TimeFieldProps & DiscardedFieldProps>(function TimeField({
  label,
  description,
  errorMessage,
  value,
  defaultValue,
  minValue,
  maxValue,
  onChange,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  size = 'md',
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'TimeField');
  const resolvedSize = normalizeChoiceControlSize(size, 'TimeField');
  const externalValidation = useMuxFormValidation(name);
  const effectiveErrorMessage = errorMessage !== undefined ? errorMessage : externalValidation.message || undefined;
  const parsedValue = React.useMemo(() => controlledTemporal(value, timeOrUndefined), [value]);
  const parsedDefaultValue = React.useMemo(() => timeOrUndefined(defaultValue), [defaultValue]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = timeBounds(minValue, maxValue);
  const [formValue, setFormValue] = React.useState(() => serializeTimeValue(parsedValue ?? parsedDefaultValue));
  const resettingRef = React.useRef(false);
  const handleChange = (next: TimeValue | null) => {
    if (resettingRef.current) return;
    const nextValue = serializeTimeValue(next);
    externalValidation.dismiss();
    if (value === undefined) setFormValue(nextValue);
    onChange?.(nextValue);
  };
  const handleReset = () => {
    externalValidation.dismiss();
    if (value === undefined) setFormValue(serializeTimeValue(parsedDefaultValue));
  };
  const resetInputRef = useOwningFormReset(handleReset, () => { resettingRef.current = true; }, () => { resettingRef.current = false; });
  // Mux owns TimeField state, so RAC always receives a controlled value.
  const submittedValue = value !== undefined ? serializeTimeValue(parsedValue) : formValue;
  const effectiveParsedValue = React.useMemo(() => timeOrUndefined(submittedValue) ?? null, [submittedValue]);
  return React.createElement(AriaTimeField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid: invalid ? invalid : externalValidation.isInvalid }),
    value: effectiveParsedValue,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    placeholderValue: TIME_PLACEHOLDER,
    onChange: handleChange,
    // Keep RAC's name private: Mux owns one normalized hidden value so FormData
    // stays stable and cannot duplicate an upstream field input.
    name: undefined,
    className: classNames('muxui-time-field', className),
    ...{ 'data-muxui-size': resolvedSize },
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage: effectiveErrorMessage,
    input: dateInput(),
    children: React.createElement(React.Fragment, null,
      formResetAnchor(resetInputRef),
      name ? React.createElement('input', { type: 'hidden', name, value: submittedValue ?? '', disabled, readOnly: true, 'aria-hidden': 'true' }) : null),
  }));
});

TimeField.displayName = 'TimeField';

// Pure wrappers let unused date-picker imports omit motion code.
export const DatePicker: ForwardRefExoticComponent<DatePickerProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, DatePickerProps & DiscardedDateProps>(function DatePicker({
    label,
    description,
    errorMessage,
    value,
    defaultValue,
    minValue,
    maxValue,
    unavailableDateMatcher,
    isDateUnavailable: _upstreamDateUnavailable,
    onChange,
    onOpenChange,
    open,
    defaultOpen,
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    size = 'md',
    validationBehavior: _validationBehavior,
    name,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...props
  }, ref) {
    assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'DatePicker');
    const resolvedSize = normalizeChoiceControlSize(size, 'DatePicker');
    const parsedValue = React.useMemo(() => controlledTemporal(value, dateOrUndefined), [value]);
    const parsedDefaultValue = React.useMemo(() => dateOrUndefined(defaultValue), [defaultValue]);
    const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
    return React.createElement(AriaDatePicker, {
      ...props,
      ref,
      ...validationProps({ disabled, readOnly, required, invalid }),
      value: parsedValue,
      defaultValue: parsedDefaultValue,
      minValue: parsedMinValue,
      maxValue: parsedMaxValue,
      isDateUnavailable: unavailableDateCallback(unavailableDateMatcher),
      onChange: (next) => onChange?.(serializeDateValue(next)),
      isOpen: open,
      defaultOpen,
      onOpenChange,
      name,
      className: classNames('muxui-date-picker', className),
      ...{ 'data-muxui-size': resolvedSize },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, fieldChildren({
      label,
      description,
      errorMessage,
      input: React.createElement(AriaGroup, { className: 'muxui-date-control' }, dateInput(), React.createElement(IconButton, { slot: 'button', type: 'button', 'aria-label': 'Open calendar', className: 'muxui-date-trigger' }, calendarGlyph())),
      children: datePopover(),
    }));
  });
  component.displayName = 'DatePicker';
  return component;
})();

export const DateRangePicker: ForwardRefExoticComponent<DateRangePickerProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, DateRangePickerProps & DiscardedDateRangeProps>(function DateRangePicker({
    label,
    description,
    errorMessage,
    value,
    defaultValue,
    minValue,
    maxValue,
    unavailableDateMatcher,
    isDateUnavailable: _upstreamDateUnavailable,
    onChange,
    onOpenChange,
    open,
    defaultOpen,
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    size = 'md',
    validationBehavior: _validationBehavior,
    allowsNonContiguousRanges: _allowsNonContiguousRanges,
    closeOnSelect: _closeOnSelect,
    shouldCloseOnSelect: _shouldCloseOnSelect,
    startName,
    endName,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...props
  }, ref) {
    assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'DateRangePicker');
    const resolvedSize = normalizeChoiceControlSize(size, 'DateRangePicker');
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const externalValidation = useMuxFormValidation([startName, endName]);
    const effectiveErrorMessage = errorMessage !== undefined ? errorMessage : externalValidation.message || undefined;
    const parsedValue = React.useMemo(() => controlledTemporal(value, dateRangeOrUndefined), [value === null, value?.start, value?.end]);
    const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
    const [formValue, setFormValue] = React.useState(() => (value === undefined || value === null ? defaultValue : value) ?? null);
    const resettingRef = React.useRef(false);
    const handleChange = (next: { start: DateValue; end: DateValue } | null) => {
      if (resettingRef.current) return;
      const nextValue = next ? { start: serializeDateValue(next.start), end: serializeDateValue(next.end) } : null;
      externalValidation.dismiss();
      if (value === undefined) setFormValue(nextValue);
      onChange?.(nextValue);
    };
    const handleReset = () => {
      externalValidation.dismiss();
      if (value === undefined) setFormValue(defaultValue === undefined || defaultValue === null ? null : defaultValue);
    };
    const resetInputRef = useOwningFormReset(handleReset, () => { resettingRef.current = true; }, () => { resettingRef.current = false; });
    const submittedValue = value !== undefined ? value : formValue;
    const parsedFormValue = React.useMemo(() => dateRangeOrUndefined(formValue) ?? null, [formValue?.start, formValue?.end]);
    // Mux owns range state, so RAC always receives a controlled value.
    const effectiveValueObject = value !== undefined ? parsedValue : parsedFormValue;
    return React.createElement(AriaDateRangePicker, {
      ...props,
      ref,
      ...validationProps({ disabled, readOnly, required, invalid: invalid ? invalid : externalValidation.isInvalid }),
      value: effectiveValueObject,
      minValue: parsedMinValue,
      maxValue: parsedMaxValue,
      isDateUnavailable: unavailableDateRangeCallback(unavailableDateMatcher),
      onChange: handleChange,
      isOpen: open,
      defaultOpen,
      onOpenChange,
      // React Aria's range picker takes startName and endName, not a name.
      ...{ name: undefined },
      className: classNames('muxui-date-range-picker', className),
      ...{ 'data-muxui-size': resolvedSize },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, fieldChildren({
      label,
      description,
      errorMessage: effectiveErrorMessage,
      input: React.createElement(AriaGroup, { className: 'muxui-date-range-control' },
        React.createElement(AriaDateInput, {
          slot: 'start',
          className: 'muxui-date-input muxui-date-range-picker__start',
          children: (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' }),
        }),
        React.createElement('span', { className: 'muxui-date-range-separator', 'aria-hidden': 'true' }, '–'),
        React.createElement(AriaDateInput, {
          slot: 'end',
          className: 'muxui-date-input muxui-date-range-picker__end',
          children: (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' }),
        }),
        React.createElement(IconButton, { ref: triggerRef, slot: 'button', type: 'button', 'aria-label': 'Open calendar', className: 'muxui-date-trigger' }, calendarGlyph())),
      children: React.createElement(React.Fragment, null,
        rangeDatePopover(triggerRef),
        formResetAnchor(resetInputRef),
        startName ? React.createElement('input', { type: 'hidden', name: startName, value: submittedValue?.start ?? '', disabled, readOnly: true, 'aria-hidden': 'true' }) : null,
        endName ? React.createElement('input', { type: 'hidden', name: endName, value: submittedValue?.end ?? '', disabled, readOnly: true, 'aria-hidden': 'true' }) : null),
    }));
  });
  component.displayName = 'DateRangePicker';
  return component;
})();

// An item as the list and the form read it, with every field filled in.
interface NormalizedAutocompleteItem {
  id: string;
  label: ReactNode;
  value: string;
  disabled?: boolean;
}

function normalizeAutocompleteItems(items: (AutocompleteItem | string)[] | null | undefined): NormalizedAutocompleteItem[] {
  const usedIds = new Set<string>();
  return (items ?? []).map((item, index) => {
    const source: AutocompleteItem = typeof item === 'string'
      ? { label: item, value: item }
      : item;
    const baseId = String(source.id ?? source.value ?? index) || String(index);
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    // A label-only item submits its text rather than its generated index id.
    const value = source.value ?? (source.id === undefined ? autocompleteNodeText(source.label) || id : id);
    return { ...source, id, label: source.label ?? source.value ?? id, value };
  });
}

function autocompleteNodeText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(autocompleteNodeText).join('');
  if (React.isValidElement<{ children?: ReactNode }>(value)) return autocompleteNodeText(value.props.children);
  return '';
}

function autocompleteItemText(item: NormalizedAutocompleteItem) {
  const fallback = String(item.value ?? item.id);
  return autocompleteNodeText(item.label) || fallback;
}

const AUTOCOMPLETE_SIZES = new Set<string>(['sm', 'md', 'lg']);

function normalizeAutocompleteSize(size: ControlSize | undefined) {
  const resolved = size ?? 'md';
  if (!AUTOCOMPLETE_SIZES.has(resolved)) {
    throw new TypeError(`Autocomplete size must be one of: ${[...AUTOCOMPLETE_SIZES].join(', ')}`);
  }
  return resolved;
}

// What the input holds. A value from a prop resolves its label on every render; typed and
// selected text keeps its own.
type AutocompleteEntry =
  | { fromProp: string; selected?: undefined; text?: undefined }
  | { fromProp?: undefined; selected: string | null; text: string };

export const Autocomplete: ForwardRefExoticComponent<AutocompleteProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, AutocompleteProps & DiscardedFieldProps>(function Autocomplete({
    label,
    description,
    errorMessage,
    items,
    value,
    defaultValue = '',
    onChange,
    onSelect,
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    size = 'md',
    validationBehavior: _validationBehavior,
    name,
    placeholder,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...props
  }, ref) {
    assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'Autocomplete');
    const resolvedSize = normalizeAutocompleteSize(size);
    const normalizedItems = React.useMemo(() => normalizeAutocompleteItems(items), [items]);
    // The input shows a selected item's label while the form and onChange
    // carry its value; typed text is both the shown and the submitted value.
    const entryForValue = (nextValue: string): { text: string; selected: string | null } => {
      const item = normalizedItems.find((candidate) => String(candidate.value) === nextValue);
      return item ? { text: autocompleteItemText(item), selected: nextValue } : { text: nextValue, selected: null };
    };
    // Prop-sourced entries resolve their label on every render, so items that
    // load after the value still show its label. Typed and selected entries
    // keep their own text.
    const [storedEntry, setEntry] = React.useState<AutocompleteEntry>(() => ({ fromProp: (value === undefined || value === null ? defaultValue : value) ?? '' }));
    const storedValue = storedEntry.fromProp ?? storedEntry.selected ?? storedEntry.text;
    // A controlled value that differs from the last edit came from outside.
    const entry = value !== undefined && value !== storedValue
      ? entryForValue(value)
      : storedEntry.fromProp !== undefined ? entryForValue(storedEntry.fromProp) : storedEntry;
    const submittedValue = entry.selected ?? entry.text;
    const effectiveInputValue = entry.text;
    const externalValidation = useMuxFormValidation(name);
    const effectiveErrorMessage = errorMessage !== undefined ? errorMessage : externalValidation.message || undefined;
    const resettingRef = React.useRef(false);
    const resetInputRef = useOwningFormReset(() => {
      externalValidation.dismiss();
      if (value === undefined) setEntry({ fromProp: defaultValue ?? '' });
    }, () => { resettingRef.current = true; }, () => { resettingRef.current = false; });
    const filteredItems = React.useMemo(() => {
      const query = effectiveInputValue.toLocaleLowerCase();
      return normalizedItems.filter((item) => autocompleteItemText(item).toLocaleLowerCase().includes(query));
    }, [effectiveInputValue, normalizedItems]);
    const [isOpen, setIsOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // The visible input finds the owning form, so no extra reset anchor input is needed.
    const setInputRef = React.useCallback((node: HTMLInputElement | null) => {
      inputRef.current = node;
      resetInputRef(node);
    }, [resetInputRef]);
    const popoverRef = React.useRef<HTMLElement | null>(null);
    // Outside dismissal lets RAC restore this trigger; consume that focus without reopening.
    const pendingFocusRestoreRef = React.useRef(false);
    const pendingFocusRestoreCleanupRef = React.useRef<(() => void) | null>(null);
    // The guard's one pending frame: the post-blur focus check or the expiry.
    const pendingFocusRestoreFrameRef = React.useRef(0);
    const clearPendingFocusRestore = () => {
      pendingFocusRestoreRef.current = false;
      if (pendingFocusRestoreFrameRef.current) cancelAnimationFrame(pendingFocusRestoreFrameRef.current);
      pendingFocusRestoreFrameRef.current = 0;
      pendingFocusRestoreCleanupRef.current?.();
      pendingFocusRestoreCleanupRef.current = null;
    };
    // RAC restores trigger focus one frame after the popover's FocusScope
    // unmounts, and only when the list was its active scope. Expire the guard
    // two frames after the list is gone so an unused guard cannot swallow a
    // later legitimate focus. After a virtual (screen reader) interaction RAC
    // defers its restore until page transitions end, which can outlast this.
    const expirePendingFocusRestore = () => {
      if (!pendingFocusRestoreRef.current) return;
      cancelAnimationFrame(pendingFocusRestoreFrameRef.current);
      pendingFocusRestoreFrameRef.current = requestAnimationFrame(() => {
        pendingFocusRestoreFrameRef.current = requestAnimationFrame(() => {
          if (!popoverRef.current?.isConnected) clearPendingFocusRestore();
        });
      });
    };
    const armPendingFocusRestore = () => {
      clearPendingFocusRestore();
      pendingFocusRestoreRef.current = true;
      if (!popoverRef.current?.isConnected) expirePendingFocusRestore();
      const handleFocusIn = (event: globalThis.FocusEvent) => {
        const target = event.target as Node | null;
        const externalFocus = target
          && target !== document.body
          && target !== document.documentElement
          && target !== inputRef.current
          && !inputRef.current?.contains(target)
          && !popoverRef.current?.contains(target);
        if (externalFocus) clearPendingFocusRestore();
      };
      const handleKeyDown = (event: globalThis.KeyboardEvent) => {
        if (event.key === 'Tab') clearPendingFocusRestore();
      };
      document.addEventListener('focusin', handleFocusIn, true);
      document.addEventListener('keydown', handleKeyDown, true);
      pendingFocusRestoreCleanupRef.current = () => {
        document.removeEventListener('focusin', handleFocusIn, true);
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    };
    React.useEffect(() => () => clearPendingFocusRestore(), []);
    // Stable so PopoverMotion only sees null when the list actually detaches;
    // the guard helpers read refs alone, so the first-render closures suffice.
    const setPopoverRef = React.useCallback((node: HTMLElement | null) => {
      popoverRef.current = node;
      if (!node) expirePendingFocusRestore();
    }, []);
    const suggestionsOpen = isOpen && filteredItems.length > 0;
    const portalContainer = autocompletePortalContainer(inputRef.current);
    React.useEffect(() => {
      if (!suggestionsOpen) return undefined;
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (inputRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
        if (document.activeElement === inputRef.current) armPendingFocusRestore();
        setIsOpen(false);
      };
      document.addEventListener('pointerdown', handlePointerDown, true);
      return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    }, [suggestionsOpen]);
    const filter = (textValue: string, inputValue: string) => textValue.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase());
    const handleSelect = (key: Key) => {
      if (disabled) return;
      if (readOnly) return;
      const keyText = String(key);
      const item = filteredItems.find((candidate) => String(candidate.id) === keyText);
      if (item) {
        if (item.disabled) return;
        const nextValue = String(item.value);
        externalValidation.dismiss();
        setEntry({ text: autocompleteItemText(item), selected: nextValue });
        onChange?.(nextValue);
      }
      onSelect?.(item);
      setIsOpen(false);
    };
    const handleInputChange = (next: string) => {
      clearPendingFocusRestore();
      if (disabled) return;
      if (readOnly) return;
      if (resettingRef.current) return;
      externalValidation.dismiss();
      setEntry({ text: next, selected: null });
      onChange?.(next);
      setIsOpen(!disabled);
    };
    return React.createElement('div', {
      ref,
      className: classNames('muxui-autocomplete', className),
      'data-muxui-size': resolvedSize,
      'data-muxui-part': 'root',
      onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
        const relatedTarget = event.relatedTarget;
        const outside = !relatedTarget || (!event.currentTarget.contains(relatedTarget) && !popoverRef.current?.contains(relatedTarget));
        if (outside) {
          if (relatedTarget && relatedTarget !== document.body && relatedTarget !== document.documentElement) {
            clearPendingFocusRestore();
          } else if (event.target === inputRef.current && popoverRef.current?.isConnected && !pendingFocusRestoreRef.current) {
            // Focus left for no element while the list is mounted (open or
            // exiting). If it settles on the body, RAC may restore it to this
            // input on unmount, so arm the guard. This also covers closes the
            // pointerdown guard never saw, such as RAC's close on scroll.
            // Engines disagree on the active element during blur (Firefox
            // reports a focused iframe, Chromium and WebKit the body), so decide
            // one frame later. RAC requests its restore frame at unmount, after
            // this blur, so this check runs first. Window and tab switches keep
            // the input active, and an iframe or a same-task refocus never
            // leaves the body active, so none of them arm the guard.
            cancelAnimationFrame(pendingFocusRestoreFrameRef.current);
            pendingFocusRestoreFrameRef.current = requestAnimationFrame(() => {
              pendingFocusRestoreFrameRef.current = 0;
              if (document.activeElement === document.body) armPendingFocusRestore();
            });
          }
          setIsOpen(false);
        }
      },
    }, React.createElement(AriaAutocomplete, {
      ...props,
      filter,
      disableAutoFocusFirst: false,
      inputValue: effectiveInputValue,
      onInputChange: handleInputChange,
      children: CHILDREN_FOLLOW,
    }, React.createElement(AriaSearchField, {
      ...validationProps({ disabled, readOnly, required, invalid: invalid ? invalid : externalValidation.isInvalid }),
      // Keep RAC's name private: the hidden input below submits the value.
      name: undefined,
      className: 'muxui-autocomplete-search',
      ...{ 'data-muxui-part': 'search-field' },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, fieldChildren({
      label,
      description,
      errorMessage: effectiveErrorMessage,
      input: React.createElement(FieldInput, {
        ref: setInputRef,
        className: 'muxui-field-input',
        ...{ 'data-muxui-part': 'input' },
        // WAI-ARIA combobox: RAC supplies aria-autocomplete, aria-controls,
        // and aria-activedescendant; the popup state is Mux-owned.
        role: 'combobox',
        'aria-expanded': suggestionsOpen,
        placeholder,
        onPointerDown: () => {
          clearPendingFocusRestore();
          if (document.activeElement === inputRef.current) setIsOpen(!disabled);
        },
        onFocus: () => {
          if (pendingFocusRestoreRef.current) {
            clearPendingFocusRestore();
            return;
          }
          setIsOpen(!disabled);
        },
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          clearPendingFocusRestore();
          if (event.key === 'Escape' && suggestionsOpen) {
            // Close the open list without the SearchField shortcut clearing
            // the text; Escape on a closed list still clears.
            event.preventDefault();
            event.stopPropagation();
          }
          if (event.key === 'Enter' && suggestionsOpen && popoverRef.current?.querySelector('[role="option"][data-muxui-state-focused]')) {
            // RAC selects the active option but leaves the browser's implicit
            // form submission. Cancel only the native default so the synthetic
            // event still reaches RAC's selection handler through FieldInput.
            // The option's data-muxui-state-focused leads aria-activedescendant, which RAC
            // delays while the user types.
            event.nativeEvent.preventDefault();
          }
          if (event.key === 'Escape') setIsOpen(false);
          if (event.key === 'ArrowDown') setIsOpen(!disabled);
        },
      }),
      children: name ? React.createElement('input', { type: 'hidden', name, value: submittedValue, disabled, readOnly: true, 'aria-hidden': 'true' }) : null,
    })),
    React.createElement(PopoverMotion, {
      ref: setPopoverRef,
      isOpen: suggestionsOpen,
      onOpenChange: setIsOpen,
      isNonModal: true,
      triggerRef: inputRef,
      placement: 'bottom',
      offset: 0,
      // Zero padding keeps a full-width field's overlay aligned at the viewport
      // edge; the position hook still performs collision-aware placement.
      containerPadding: 0,
      // Keep portals inside subtree-scoped Mux runtime profiles so their tokens,
      // direction, and other inherited custom properties remain available.
      UNSTABLE_portalContainer: portalContainer,
      className: 'muxui-autocomplete-popover',
      ...{ 'data-muxui-part': 'popover' },
    }, React.createElement(AriaListBox<NormalizedAutocompleteItem>, {
      items: filteredItems,
      className: classNames('muxui-autocomplete-list', resolvedSize === 'md' ? undefined : `muxui-autocomplete-list--${resolvedSize}`),
      ...{ 'data-muxui-part': 'list', 'data-muxui-size': resolvedSize },
      selectionMode: readOnly ? 'none' : 'single',
      onAction: handleSelect,
      children: (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: autocompleteItemText(item), isDisabled: item.disabled, ...{ 'data-muxui-state-disabled': item.disabled || undefined, 'data-muxui-part': 'option' }, className: 'muxui-autocomplete-option' }, item.label),
    }))));
  });

  component.displayName = 'Autocomplete';
  return component;
})();
