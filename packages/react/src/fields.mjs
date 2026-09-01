import React from 'react';
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  CalendarHeading as AriaCalendarHeading,
  CheckboxGroup as AriaCheckboxGroup,
  DateField as AriaDateField,
  DateInput as AriaDateInput,
  DatePicker as AriaDatePicker,
  DateRangePicker as AriaDateRangePicker,
  DateSegment as AriaDateSegment,
  Dialog as AriaDialog,
  FieldError as AriaFieldError,
  Form as AriaForm,
  Group as AriaGroup,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  NumberField as AriaNumberField,
  Popover as AriaPopover,
  RangeCalendar as AriaRangeCalendar,
  SearchField as AriaSearchField,
  SwitchButton as AriaSwitchButton,
  SwitchField as AriaSwitchField,
  Text as AriaText,
  TextField as AriaTextField,
  TimeField as AriaTimeField,
} from 'react-aria-components';
import { parseDate, parseTime } from '@internationalized/date';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import PlusIcon from 'lucide-react/dist/esm/icons/plus.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/u;
const DATE_PLACEHOLDER = parseDate('2000-01-01');
const TIME_PLACEHOLDER = parseTime('00:00');

function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
}

function fieldLabel(label) {
  return label === undefined || label === null ? null : React.createElement(AriaLabel, { className: 'muxui-field-label' }, label);
}

function assertAccessibleName({ label, ariaLabel, ariaLabelledby }, componentName) {
  if ((label === undefined || label === null || label === false || label === '') && !ariaLabel && !ariaLabelledby) {
    throw new TypeError(`${componentName} requires label, aria-label, or aria-labelledby`);
  }
}

function fieldDescription(description) {
  return description === undefined ? null : React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description);
}

function fieldError(errorMessage) {
  return React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage);
}

// Keep the approved Tale-era calendar geometry Mux UI-owned instead of importing the 1.37 glyph.
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

function fieldChildren({ label, description, errorMessage, children, input }) {
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
const MuxFormValidationContext = React.createContext(null);

function normalizeValidationMessages(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value])
    .filter((message) => message !== undefined && message !== null)
    .map(String);
}

function useMuxFormValidation(names) {
  const validationErrors = React.useContext(MuxFormValidationContext);
  const messages = (Array.isArray(names) ? names : [names]).flatMap((name) => {
    if (!name || !validationErrors || !Object.prototype.hasOwnProperty.call(validationErrors, name)) return [];
    return normalizeValidationMessages(validationErrors[name]);
  });
  return { isInvalid: messages.length > 0, message: messages.join(' ') };
}

function validationProps({ disabled, readOnly, required, invalid, errorMessage }) {
  return {
    isDisabled: disabled,
    isReadOnly: readOnly,
    isRequired: required,
    // Leave invalid uncontrolled when no local error is present so Form's
    // name-keyed server validation can flow through RAC's context.
    isInvalid: invalid || errorMessage !== undefined ? true : undefined,
  };
}

function dateOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const message = 'Mux UI date values must use YYYY-MM-DD ISO format';
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new TypeError(message);
  try {
    return parseDate(value);
  } catch {
    throw new TypeError(message);
  }
}

function timeOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const message = 'Mux UI time values must use HH:mm[:ss[.fraction]] ISO format';
  if (typeof value !== 'string' || !ISO_TIME_PATTERN.test(value)) throw new TypeError(message);
  try {
    return parseTime(value);
  } catch {
    throw new TypeError(message);
  }
}

function dateRangeOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const message = 'Mux UI date ranges must include start and end ISO dates';
  if (typeof value !== 'object' || Array.isArray(value) || value.start === undefined || value.start === null || value.start === '' || value.end === undefined || value.end === null || value.end === '') {
    throw new TypeError(message);
  }
  return { start: dateOrUndefined(value.start), end: dateOrUndefined(value.end) };
}

function assertTemporalBounds(minValue, maxValue, valueName) {
  if (minValue && maxValue && minValue.compare(maxValue) > 0) {
    throw new TypeError(`Mux UI ${valueName} minValue must be less than or equal to maxValue`);
  }
}

function dateBounds(minValue, maxValue) {
  const parsedMinValue = dateOrUndefined(minValue);
  const parsedMaxValue = dateOrUndefined(maxValue);
  assertTemporalBounds(parsedMinValue, parsedMaxValue, 'date');
  return { minValue: parsedMinValue, maxValue: parsedMaxValue };
}

function timeBounds(minValue, maxValue) {
  const parsedMinValue = timeOrUndefined(minValue);
  const parsedMaxValue = timeOrUndefined(maxValue);
  assertTemporalBounds(parsedMinValue, parsedMaxValue, 'time');
  return { minValue: parsedMinValue, maxValue: parsedMaxValue };
}

function unavailableDateCallback(callback, range = false) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') throw new TypeError('unavailableDateMatcher must be a function');
  return range
    ? (date, anchorDate) => callback(String(date), anchorDate ? String(anchorDate) : null)
    : (date) => callback(String(date));
}

function serializeDateValue(value) {
  return value ? String(value) : undefined;
}

function calendarChildren(cellClass = 'muxui-calendar-cell') {
  return React.createElement(AriaCalendarGrid, { className: 'muxui-calendar-grid' },
    React.createElement(AriaCalendarGridHeader, { className: 'muxui-calendar-grid-header' },
      (day) => React.createElement(AriaCalendarHeaderCell, { className: 'muxui-calendar-header-cell' }, day)),
    React.createElement(AriaCalendarGridBody, { className: 'muxui-calendar-grid-body' },
      (date) => React.createElement(AriaCalendarCell, { date, className: cellClass })),
  );
}

function calendarHeader() {
  return React.createElement('div', { className: 'muxui-calendar-header' },
    React.createElement(AriaButton, { slot: 'previous', 'aria-label': 'Previous month', className: 'muxui-calendar-previous' }, React.createElement(ChevronLeftIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })),
    React.createElement(AriaCalendarHeading, { className: 'muxui-calendar-heading' }),
    React.createElement(AriaButton, { slot: 'next', 'aria-label': 'Next month', className: 'muxui-calendar-next' }, React.createElement(ChevronRightIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })));
}

function datePopover() {
  return React.createElement(AriaPopover, { className: 'muxui-date-popover' }, React.createElement(AriaDialog, { className: 'muxui-date-dialog' }, React.createElement(AriaCalendar, { className: 'muxui-calendar' }, calendarHeader(), calendarChildren())));
}

function rangeDatePopover() {
  return React.createElement(AriaPopover, { className: 'muxui-date-popover' }, React.createElement(AriaDialog, { className: 'muxui-date-dialog' }, React.createElement(AriaRangeCalendar, { className: 'muxui-calendar' }, calendarHeader(), calendarChildren('muxui-range-calendar-cell'))));
}

function dateInput() {
  return React.createElement(AriaDateInput, { className: 'muxui-date-input' }, (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' }));
}

// RAC 1.20 owns form reset for most fields, but not TimeField and the
// range serialization below. Attach one listener to the component's owning
// form so multiple forms/components remain isolated and teardown is exact.
// Capture blocks intermediate RAC changes; the callback waits for consumer
// onReset handlers to finish before checking cancellation.
function useOwningFormReset(onReset, onResetStart, onResetEnd) {
  const callbackRef = React.useRef(onReset);
  const resetStartRef = React.useRef(onResetStart);
  const resetEndRef = React.useRef(onResetEnd);
  const formRef = React.useRef(null);
  const listenerRef = React.useRef(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  resetStartRef.current = onResetStart;
  resetEndRef.current = onResetEnd;
  return React.useCallback((node) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) {
      formRef.current.removeEventListener('reset', listenerRef.current, true);
    }
    formRef.current = nextForm;
    listenerRef.current = null;
    if (nextForm) {
      const listener = (event) => {
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

function formResetAnchor(ref) {
  return React.createElement('input', {
    ref,
    type: 'hidden',
    disabled: true,
    tabIndex: -1,
    className: 'muxui-form-reset-anchor',
    'aria-hidden': 'true',
  });
}

export const TextField = React.forwardRef(function TextField({
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
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'TextField');
  return React.createElement(AriaTextField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value,
    defaultValue,
    onChange,
    name,
    className: classNames('muxui-text-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(AriaInput, {
      className: 'muxui-field-input',
      type,
      placeholder,
      autoComplete,
      autoFocus,
      inputMode,
      maxLength,
      minLength,
      pattern,
      spellCheck,
    }),
  }));
});

TextField.displayName = 'TextField';

export const SearchField = React.forwardRef(function SearchField({
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
  validationBehavior: _validationBehavior,
  name,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'SearchField');
  return React.createElement(AriaSearchField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value,
    defaultValue,
    onChange,
    onSubmit,
    name,
    className: classNames('muxui-search-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement('div', { className: 'muxui-search-control' },
      React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
      React.createElement(AriaButton, { slot: 'clear', type: 'button', className: 'muxui-search-clear', 'aria-label': 'Clear search', onPress: onClear }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 14 }))),
  }));
});

SearchField.displayName = 'SearchField';

export const NumberField = React.forwardRef(function NumberField({
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
  return React.createElement(AriaNumberField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value,
    defaultValue,
    onChange,
    name,
    minValue,
    maxValue,
    step,
    formatOptions,
    className: classNames('muxui-number-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(AriaGroup, { className: 'muxui-number-control' },
      React.createElement(AriaButton, { slot: 'decrement', type: 'button', className: 'muxui-number-stepper muxui-number-stepper-decrement' }, React.createElement(MinusIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })),
      React.createElement(AriaInput, { className: 'muxui-field-input', inputMode: 'decimal' }),
      React.createElement(AriaButton, { slot: 'increment', type: 'button', className: 'muxui-number-stepper muxui-number-stepper-increment' }, React.createElement(PlusIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
  }));
});

NumberField.displayName = 'NumberField';

export const CheckboxGroup = React.forwardRef(function CheckboxGroup({
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
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  children,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'CheckboxGroup');
  return React.createElement(AriaCheckboxGroup, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value,
    defaultValue,
    onChange,
    // RAC carries this through CheckboxGroupStateContext to every descendant
    // checkbox, including fragments and wrapper components.
    name,
    className: classNames('muxui-checkbox-group', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    children,
  }));
});

CheckboxGroup.displayName = 'CheckboxGroup';

export const Switch = React.forwardRef(function Switch({
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
  validationBehavior: _validationBehavior,
  name,
  value,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'Switch');
  const visibleLabel = label ?? children;
  return React.createElement(AriaSwitchField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    isSelected: selected,
    defaultSelected,
    name,
    value,
    className: classNames('muxui-switch-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    onChange,
  }, React.createElement(AriaSwitchButton, { className: 'muxui-switch' }, ({ isSelected }) => React.createElement(React.Fragment, null,
    React.createElement('span', { className: 'muxui-switch-indicator', 'aria-hidden': 'true', 'data-selected': isSelected || undefined }),
    visibleLabel !== undefined && visibleLabel !== null
      ? React.createElement('span', { className: 'muxui-switch-label' }, visibleLabel)
      : null)),
  fieldDescription(description),
  fieldError(errorMessage));
});

Switch.displayName = 'Switch';

export const Form = React.forwardRef(function Form({
  children,
  className,
  validationBehavior = 'native',
  validationErrors,
  onSubmit,
  onReset,
  ...props
}, ref) {
  return React.createElement(AriaForm, {
    ...props,
    ref,
    className: classNames('muxui-form', className),
    validationBehavior,
    validationErrors,
    onSubmit,
    onReset,
  }, React.createElement(MuxFormValidationContext.Provider, { value: validationErrors ?? {} }, children));
});

Form.displayName = 'Form';

export const DateField = React.forwardRef(function DateField({
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
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'DateField');
  const parsedValue = React.useMemo(() => dateOrUndefined(value), [value]);
  const parsedDefaultValue = React.useMemo(() => dateOrUndefined(defaultValue), [defaultValue]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
  return React.createElement(AriaDateField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value: parsedValue,
    defaultValue: parsedDefaultValue,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    isDateUnavailable: unavailableDateCallback(unavailableDateMatcher),
    placeholderValue: DATE_PLACEHOLDER,
    onChange: (next) => onChange?.(serializeDateValue(next)),
    name,
    className: classNames('muxui-date-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({ label, description, errorMessage, input: dateInput() }));
});

DateField.displayName = 'DateField';

export const TimeField = React.forwardRef(function TimeField({
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
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'TimeField');
  const externalValidation = useMuxFormValidation(name);
  const effectiveErrorMessage = errorMessage !== undefined ? errorMessage : externalValidation.message || undefined;
  React.useMemo(() => timeOrUndefined(value), [value]);
  React.useMemo(() => timeOrUndefined(defaultValue), [defaultValue]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = timeBounds(minValue, maxValue);
  const [formValue, setFormValue] = React.useState(() => value ?? defaultValue ?? '');
  const resettingRef = React.useRef(false);
  React.useEffect(() => {
    if (value !== undefined) setFormValue(value);
  }, [value]);
  const handleChange = (next) => {
    if (resettingRef.current) return;
    const nextValue = serializeDateValue(next);
    setFormValue(nextValue ?? '');
    onChange?.(nextValue);
  };
  const handleReset = () => {
    if (value === undefined) setFormValue(defaultValue ?? '');
  };
  const resetInputRef = useOwningFormReset(handleReset, () => { resettingRef.current = true; }, () => { resettingRef.current = false; });
  const effectiveValue = value ?? formValue;
  const effectiveParsedValue = React.useMemo(() => timeOrUndefined(effectiveValue), [effectiveValue]);
  return React.createElement(AriaTimeField, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid: invalid || externalValidation.isInvalid, errorMessage: effectiveErrorMessage }),
    value: effectiveParsedValue,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    placeholderValue: TIME_PLACEHOLDER,
    onChange: handleChange,
    // Keep RAC's name private: Mux owns one normalized hidden value so FormData
    // stays stable and cannot duplicate an upstream field input.
    name: undefined,
    className: classNames('muxui-time-field', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage: effectiveErrorMessage,
    input: dateInput(),
    children: React.createElement(React.Fragment, null,
      formResetAnchor(resetInputRef),
      name ? React.createElement('input', { type: 'hidden', name, value: value ?? formValue, disabled, readOnly: true, 'aria-hidden': 'true' }) : null),
  }));
});

TimeField.displayName = 'TimeField';

export const DatePicker = React.forwardRef(function DatePicker({
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
  validationBehavior: _validationBehavior,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'DatePicker');
  const parsedValue = React.useMemo(() => dateOrUndefined(value), [value]);
  const parsedDefaultValue = React.useMemo(() => dateOrUndefined(defaultValue), [defaultValue]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
  return React.createElement(AriaDatePicker, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    value: parsedValue,
    defaultValue: parsedDefaultValue,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    isDateUnavailable: unavailableDateCallback(unavailableDateMatcher),
    placeholderValue: DATE_PLACEHOLDER,
    onChange: (next) => onChange?.(serializeDateValue(next)),
    isOpen: open,
    defaultOpen,
    onOpenChange,
    name,
    className: classNames('muxui-date-picker', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(AriaGroup, { className: 'muxui-date-control' }, dateInput(), React.createElement(AriaButton, { slot: 'button', type: 'button', 'aria-label': 'Open calendar', className: 'muxui-date-trigger' }, calendarGlyph())),
    children: datePopover(),
  }));
});

DatePicker.displayName = 'DatePicker';

export const DateRangePicker = React.forwardRef(function DateRangePicker({
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
  const externalValidation = useMuxFormValidation([startName, endName]);
  const effectiveErrorMessage = errorMessage !== undefined ? errorMessage : externalValidation.message || undefined;
  const parsedValue = React.useMemo(() => dateRangeOrUndefined(value), [value?.start, value?.end]);
  const { minValue: parsedMinValue, maxValue: parsedMaxValue } = dateBounds(minValue, maxValue);
  const [formValue, setFormValue] = React.useState(() => value ?? defaultValue);
  const resettingRef = React.useRef(false);
  React.useEffect(() => {
    if (value !== undefined) setFormValue(value);
  }, [value]);
  const handleChange = (next) => {
    if (resettingRef.current) return;
    const nextValue = next ? { start: serializeDateValue(next.start), end: serializeDateValue(next.end) } : undefined;
    setFormValue(nextValue);
    onChange?.(nextValue);
  };
  const handleReset = () => {
    if (value === undefined) setFormValue(defaultValue);
  };
  const resetInputRef = useOwningFormReset(handleReset, () => { resettingRef.current = true; }, () => { resettingRef.current = false; });
  const parsedFormValue = React.useMemo(() => dateRangeOrUndefined(formValue), [formValue?.start, formValue?.end]);
  const effectiveValueObject = value !== undefined ? parsedValue : parsedFormValue;
  return React.createElement(AriaDateRangePicker, {
    ...props,
    ref,
    ...validationProps({ disabled, readOnly, required, invalid: invalid || externalValidation.isInvalid, errorMessage: effectiveErrorMessage }),
    value: effectiveValueObject,
    minValue: parsedMinValue,
    maxValue: parsedMaxValue,
    isDateUnavailable: unavailableDateCallback(unavailableDateMatcher, true),
    placeholderValue: DATE_PLACEHOLDER,
    onChange: handleChange,
    isOpen: open,
    defaultOpen,
    onOpenChange,
    name: undefined,
    className: classNames('muxui-date-range-picker', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage: effectiveErrorMessage,
    input: React.createElement(AriaGroup, { className: 'muxui-date-range-control' },
      React.createElement(AriaDateInput, { slot: 'start', className: 'muxui-date-input' }, (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' })),
      React.createElement('span', { className: 'muxui-date-range-separator', 'aria-hidden': 'true' }, '–'),
      React.createElement(AriaDateInput, { slot: 'end', className: 'muxui-date-input' }, (segment) => React.createElement(AriaDateSegment, { segment, className: 'muxui-date-segment' })),
      React.createElement(AriaButton, { slot: 'button', type: 'button', 'aria-label': 'Open calendar', className: 'muxui-date-trigger' }, calendarGlyph())),
    children: React.createElement(React.Fragment, null,
      rangeDatePopover(),
      formResetAnchor(resetInputRef),
      startName ? React.createElement('input', { type: 'hidden', name: startName, value: value?.start ?? formValue?.start ?? '', disabled, readOnly: true, 'aria-hidden': 'true' }) : null,
      endName ? React.createElement('input', { type: 'hidden', name: endName, value: value?.end ?? formValue?.end ?? '', disabled, readOnly: true, 'aria-hidden': 'true' }) : null),
  }));
});

DateRangePicker.displayName = 'DateRangePicker';

function normalizeAutocompleteItems(items) {
  const usedIds = new Set();
  return (items ?? []).map((item, index) => {
    const source = typeof item === 'string'
      ? { label: item, value: item }
      : item;
    const baseId = String(source.id ?? source.value ?? index) || String(index);
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return { ...source, id, label: source.label ?? source.value ?? id, value: source.value ?? id };
  });
}

function autocompleteNodeText(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(autocompleteNodeText).join('');
  if (React.isValidElement(value)) return autocompleteNodeText(value.props.children);
  return '';
}

function autocompleteItemText(item) {
  const fallback = String(item.value ?? item.id);
  return autocompleteNodeText(item.label) || fallback;
}

export const Autocomplete = React.forwardRef(function Autocomplete({
  label,
  description,
  errorMessage,
  items = [],
  value,
  defaultValue,
  onChange,
  onSelect,
  disabled = false,
  readOnly = false,
  required = false,
  invalid = false,
  validationBehavior: _validationBehavior,
  name,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  assertAccessibleName({ label, ariaLabel, ariaLabelledby }, 'Autocomplete');
  const normalizedItems = React.useMemo(() => normalizeAutocompleteItems(items), [items]);
  const [inputValue, setInputValue] = React.useState(() => value ?? defaultValue ?? '');
  React.useEffect(() => {
    if (value !== undefined) setInputValue(value);
  }, [value]);
  const effectiveInputValue = value ?? inputValue;
  const filteredItems = React.useMemo(() => {
    const query = effectiveInputValue.toLocaleLowerCase();
    return normalizedItems.filter((item) => autocompleteItemText(item).toLocaleLowerCase().includes(query));
  }, [effectiveInputValue, normalizedItems]);
  const [isOpen, setIsOpen] = React.useState(false);
  const filter = (textValue, inputValue) => textValue.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase());
  const handleSelect = (key) => {
    if (disabled || readOnly) return;
    const keyText = String(key);
    const item = filteredItems.find((candidate) => String(candidate.id) === keyText);
    if (item) {
      if (item.disabled) return;
      const nextValue = String(item.value);
      setInputValue(nextValue);
      onChange?.(nextValue);
    }
    onSelect?.(item);
    setIsOpen(false);
  };
  const handleInputChange = (next) => {
    if (disabled || readOnly) return;
    if (value === undefined) setInputValue(next);
    onChange?.(next);
    setIsOpen(!disabled);
  };
  return React.createElement('div', {
    ref,
    className: classNames('muxui-autocomplete', className),
    onBlurCapture: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    },
  }, React.createElement(AriaAutocomplete, {
    ...props,
    filter,
    disableAutoFocusFirst: false,
    inputValue: effectiveInputValue,
    onInputChange: handleInputChange,
  }, React.createElement(AriaSearchField, {
    ...validationProps({ disabled, readOnly, required, invalid, errorMessage }),
    name,
    className: 'muxui-autocomplete-search',
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, fieldChildren({
    label,
    description,
    errorMessage,
    input: React.createElement(AriaInput, {
      className: 'muxui-field-input',
      placeholder,
      onFocus: () => setIsOpen(!disabled),
      onKeyDown: (event) => {
        if (event.key === 'Escape') setIsOpen(false);
        if (event.key === 'ArrowDown') setIsOpen(!disabled);
      },
    }),
  })),
  React.createElement(AriaListBox, {
    items: filteredItems,
    className: 'muxui-autocomplete-list',
    hidden: !isOpen || filteredItems.length === 0,
    selectionMode: readOnly ? 'none' : 'single',
    onAction: handleSelect,
  }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: autocompleteItemText(item), isDisabled: item.disabled, 'data-disabled': item.disabled || undefined, className: 'muxui-autocomplete-option' }, item.label))));
});

Autocomplete.displayName = 'Autocomplete';
