import React from 'react';
import type { ForwardedRef, ForwardRefExoticComponent, ReactNode, RefAttributes, RefObject } from 'react';
import { CalendarHeightMotion } from './calendar-height-motion.mjs';
import { CalendarSelectionCell, CalendarSelectionMotion } from './calendar-selection-motion.mjs';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import { CalendarGrid as AriaCalendarGrid, CalendarGridBody as AriaCalendarGridBody, CalendarGridHeader as AriaCalendarGridHeader, CalendarHeaderCell as AriaCalendarHeaderCell, CalendarHeading as AriaCalendarHeading, CalendarStateContext, RangeCalendarStateContext, Label as AriaLabel } from 'react-aria-components';
import { AriaCalendar, AriaCalendarCell, AriaRangeCalendar } from './substrate.ts';
import type { DateValue, RangeValue } from 'react-aria-components';
import { parseDate } from '@internationalized/date';
import type { CalendarDate } from '@internationalized/date';
import { RangeSelectionMotion } from './range-selection-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAccessibleName, MuxUIDateRange, MuxUIDateValue } from './fields.ts';

// The props each calendar defines, as one type per family: the catalog's web.react API is derived from
// them (Decision 0031). Each is a type literal, not an interface, so the public props type stays
// assignable to Record<string, unknown>, as it was before the move. The accessible name's arms
// (aria-label and aria-labelledby) and className stay in the public type and are not Mux UI-owned members.

/** The props Mux UI defines for Calendar. Calendar renders no form input, description, or error message, so it submits nothing. */
export type CalendarOwnProps = {
  /** The visible label, which also names the calendar. Without one, the calendar needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The selected date as YYYY-MM-DD, when the caller controls it. null keeps a controlled calendar empty. An empty string counts as no date, and any other string that is not a valid date throws a TypeError. */
  value?: MuxUIDateValue | null;
  /** The starting selected date as YYYY-MM-DD, when the calendar controls itself. */
  defaultValue?: MuxUIDateValue;
  /** The focused date as YYYY-MM-DD, when the caller controls it. It is separate from the selected date, and controlling it also controls the month shown. Moving focus does not select. */
  focusedValue?: MuxUIDateValue;
  /** The earliest date, inclusive, that can be focused or selected. */
  minValue?: MuxUIDateValue;
  /** The latest date, inclusive, that can be focused or selected. */
  maxValue?: MuxUIDateValue;
  /** Returns true for a date that is unavailable, given as a YYYY-MM-DD string. An unavailable date can take focus but cannot be selected. */
  unavailableDateMatcher?: (date: MuxUIDateValue) => boolean;
  /** Called with the date the user selects, as YYYY-MM-DD. It is not called while the calendar is disabled or read-only. */
  onChange?: (value?: MuxUIDateValue) => void;
  /** Called with the focused date as YYYY-MM-DD when focus moves to another date, by the arrow keys or the month buttons. It is not called while the calendar is disabled. */
  onFocusChange?: (value?: MuxUIDateValue) => void;
  /** Disables the calendar: no date can be focused or selected. */
  disabled?: boolean;
  /** Makes the calendar read-only: focus still moves between dates, but selecting a date does nothing. */
  readOnly?: boolean;
  /** Marks the calendar required. It currently has no effect on a calendar, which submits no form value. */
  required?: boolean;
  /** Forces the invalid state when true. Left false, validation follows the selected dates, so a date before minValue, after maxValue, or marked unavailable still makes the calendar invalid. */
  invalid?: boolean;
};

export type CalendarProps = Omit<CalendarOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

/** The props Mux UI defines for RangeCalendar. RangeCalendar renders no form input, description, or error message, so it submits nothing. */
export type RangeCalendarOwnProps = {
  /** The visible label, which also names the calendar. Without one, the calendar needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The selected range as YYYY-MM-DD start and end dates, when the caller controls it. null keeps a controlled calendar empty. A string that is not a valid date throws a TypeError. */
  value?: MuxUIDateRange | null;
  /** The starting selected range, when the calendar controls itself. */
  defaultValue?: MuxUIDateRange;
  /** The focused date as YYYY-MM-DD, when the caller controls it. It is separate from the selected range, and controlling it also controls the month shown. Moving focus does not select. */
  focusedValue?: MuxUIDateValue;
  /** The earliest date, inclusive, that can be focused or selected. */
  minValue?: MuxUIDateValue;
  /** The latest date, inclusive, that can be focused or selected. */
  maxValue?: MuxUIDateValue;
  /** Returns true for a date that is unavailable, given as a YYYY-MM-DD string. An unavailable date can take focus but cannot be selected. */
  unavailableDateMatcher?: (date: MuxUIDateValue) => boolean;
  /** Called with the range the user selects, as YYYY-MM-DD start and end dates, once both are chosen. It is not called while the calendar is disabled or read-only. */
  onChange?: (value?: MuxUIDateRange) => void;
  /** Called with the focused date as YYYY-MM-DD when focus moves to another date, by the arrow keys or the month buttons. It is not called while the calendar is disabled. */
  onFocusChange?: (value?: MuxUIDateValue) => void;
  /** Disables the calendar: no date can be focused or selected. */
  disabled?: boolean;
  /** Makes the calendar read-only: focus still moves between dates, but selecting a range does nothing. */
  readOnly?: boolean;
  /** Marks the calendar required. It currently has no effect on a calendar, which submits no form value. */
  required?: boolean;
  /** Forces the invalid state when true. Left false, validation follows the selected range, so the calendar is still invalid when either endpoint is before minValue, after maxValue, or marked unavailable. Dates between the endpoints are not checked. */
  invalid?: boolean;
};

export type RangeCalendarProps = Omit<RangeCalendarOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

// React Aria props that a Mux UI calendar does not publish. The wrappers destructure them so a value an
// untyped caller passes never reaches React Aria through the rest spread.
type DiscardedCalendarProps = { description?: unknown; errorMessage?: unknown; isDateUnavailable?: unknown };

function dateValue(value: MuxUIDateValue | null | undefined, name = 'Calendar') {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new TypeError(`${name} values must use YYYY-MM-DD ISO format`);
  try { return parseDate(value); } catch { throw new TypeError(`${name} values must use YYYY-MM-DD ISO format`); }
}

// null keeps a controlled value controlled and empty; undefined means uncontrolled.
function controlledDateValue(value: MuxUIDateValue | null | undefined, name: string) {
  return value === null ? null : dateValue(value, name);
}

function serializeDateValue(value: DateValue): string;
function serializeDateValue(value: DateValue | null | undefined): string | undefined;
function serializeDateValue(value: DateValue | null | undefined) {
  return value ? String(value) : undefined;
}

function dateUnavailableCallback(callback: ((date: MuxUIDateValue) => boolean) | undefined, name: string) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') throw new TypeError(`${name} unavailableDateMatcher must be a function`);
  return (date: DateValue) => Boolean(callback(serializeDateValue(date)));
}

const subscribeToNothing = () => () => {};
const useCalendarLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// False while hydrating server markup, true afterwards and for client-only mounts.
function useHydrated() {
  return React.useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

function placeholderCell(cellClass: string, key?: number) {
  return React.createElement('td', { key, 'aria-hidden': 'true' }, React.createElement('div', { className: cellClass, 'data-muxui-calendar-placeholder': '' }, '\u00a0'));
}

// Server and client can disagree about today (clock and timezone), so day cells
// render only on the client. The server snapshot keeps hydration on blank,
// equally sized placeholder cells; client-only mounts render days at once.
// reserve keeps the six-week height of a deferred frame so hydration never shifts it.
function CalendarDays({ cellClass, reserve }: { cellClass: string; reserve: number | undefined }) {
  const hydrated = useHydrated();
  // The reserve holds only until the first month change, which then animates normally.
  const calendarState = React.useContext(CalendarStateContext);
  const rangeState = React.useContext(RangeCalendarStateContext);
  const state = calendarState ?? rangeState;
  const month = state ? String(state.visibleRange.start) : '';
  const [initialMonth] = React.useState(month);
  const [reserveReleased, setReserveReleased] = React.useState(false);
  if (reserve !== undefined && !reserveReleased && month !== initialMonth) setReserveReleased(true);
  // RAC's collection children are render functions its types do not take as extra createElement
  // arguments, so they go in the children prop; a React element's children are the same either way.
  const grid = React.createElement(CalendarHeightMotion, null, React.createElement(AriaCalendarGrid, { className: 'muxui-calendar-grid' },
    React.createElement(AriaCalendarGridHeader, {
      className: 'muxui-calendar-grid-header',
      children: (day) => React.createElement(AriaCalendarHeaderCell, { className: 'muxui-calendar-header-cell' }, day),
    }),
    React.createElement(AriaCalendarGridBody, {
      className: 'muxui-calendar-grid-body',
      children: (date) => !hydrated
        ? placeholderCell(cellClass)
        : cellClass === 'muxui-calendar-cell'
        ? React.createElement(AriaCalendarCell, { date, className: cellClass, children: (renderProps) => React.createElement(CalendarSelectionCell, renderProps) })
        // React Aria's props do not name the data-muxui-date hook the range styles read.
        : React.createElement(AriaCalendarCell, { date, className: cellClass, ...{ 'data-muxui-date': String(date) } }),
    }),
  ));
  const content = cellClass === 'muxui-range-calendar-cell' ? React.createElement(RangeSelectionMotion, null, grid) : grid;
  return reserve === undefined ? content : React.createElement('div', { style: reserveReleased ? undefined : { minHeight: reserve } }, content);
}

function calendarGrid(cellClass = 'muxui-calendar-cell', reserve?: number) {
  return React.createElement(CalendarDays, { cellClass, reserve });
}

// Without value, defaultValue, or focusedValue, React Aria shows the month of
// today, which server and browser may disagree on. Such calendars hydrate a
// date-free frame (label, header, blank heading, six blank weeks) and render the
// real calendar after hydration, keeping the six-week height until the month changes.
function useDeferredCalendarFrame(anchored: boolean) {
  const deferred = !useHydrated() && !anchored;
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [reserve, setReserve] = React.useState<number | undefined>(undefined);
  useCalendarLayoutEffect(() => {
    if (deferred && gridRef.current) setReserve(gridRef.current.getBoundingClientRect().height);
  }, [deferred]);
  return { deferred, gridRef, reserve };
}

// ref receives the frame root, a div like the real calendar root that replaces it.
function calendarPlaceholderFrame({ ref, className, label, labelId, gridRef, cellClass }: {
  ref: ForwardedRef<HTMLDivElement>;
  className: string;
  label: ReactNode;
  labelId: string;
  gridRef: RefObject<HTMLDivElement | null>;
  cellClass: string;
}) {
  const icon = (Icon: typeof ChevronLeftIcon) => React.createElement(Icon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' });
  const days = Array.from({ length: 7 }, (_, index) => index);
  return React.createElement('div', { ref, className, 'data-muxui-calendar-placeholder': '' },
    label !== undefined ? React.createElement('span', { id: labelId, className: 'muxui-field-label' }, label) : null,
    React.createElement('div', { className: 'muxui-calendar-header' },
      React.createElement(IconButton, { 'aria-label': 'Previous month', disabled: true, className: 'muxui-calendar-previous' }, icon(ChevronLeftIcon)),
      React.createElement('h2', { className: 'muxui-calendar-heading', 'aria-hidden': 'true' }, '\u00a0'),
      React.createElement(IconButton, { 'aria-label': 'Next month', disabled: true, className: 'muxui-calendar-next' }, icon(ChevronRightIcon))),
    React.createElement('div', { ref: gridRef },
      React.createElement('table', { className: 'muxui-calendar-grid', 'aria-hidden': 'true', cellPadding: 0 },
        React.createElement('thead', { className: 'muxui-calendar-grid-header' },
          React.createElement('tr', null, days.map((day) => React.createElement('th', { key: day, className: 'muxui-calendar-header-cell' }, '\u00a0')))),
        React.createElement('tbody', { className: 'muxui-calendar-grid-body' },
          Array.from({ length: 6 }, (_, week) => React.createElement('tr', { key: week }, days.map((day) => placeholderCell(cellClass, day))))))));
}

function calendarHeader() {
  return React.createElement('div', { className: 'muxui-calendar-header' },
    React.createElement(IconButton, { slot: 'previous', 'aria-label': 'Previous month', className: 'muxui-calendar-previous' }, React.createElement(ChevronLeftIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })),
    React.createElement(AriaCalendarHeading, { className: 'muxui-calendar-heading' }),
    React.createElement(IconButton, { slot: 'next', 'aria-label': 'Next month', className: 'muxui-calendar-next' }, React.createElement(ChevronRightIcon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' })));
}

function calendarProps(props: CalendarOwnProps & DiscardedCalendarProps & { className?: string; 'aria-label'?: string; 'aria-labelledby'?: string }, name: string, labelId: string) {
  const { value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, isDateUnavailable: _upstreamDateUnavailable, onChange, onFocusChange, disabled, readOnly, required, invalid, label, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className, ...rest } = props;
  accessibleName({ label, ariaLabel, ariaLabelledby }, name);
  return {
    ...rest,
    value: controlledDateValue(value, name),
    defaultValue: dateValue(defaultValue, name),
    focusedValue: dateValue(focusedValue, name),
    minValue: dateValue(minValue, name),
    maxValue: dateValue(maxValue, name),
    isDateUnavailable: dateUnavailableCallback(unavailableDateMatcher, name),
    isDisabled: disabled,
    isReadOnly: readOnly,
    isRequired: required,
    isInvalid: invalid ? invalid : undefined,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby ?? (label !== undefined ? labelId : undefined),
    className: classNames(`muxui-${name.toLowerCase()}`, className),
    onChange: (next: DateValue) => { if (!disabled && !readOnly) onChange?.(serializeDateValue(next)); },
    onFocusChange: (next: DateValue) => { if (!disabled) onFocusChange?.(serializeDateValue(next)); },
  };
}

export const Calendar: ForwardRefExoticComponent<CalendarProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, CalendarProps & DiscardedCalendarProps>(function Calendar({
    label, description: _description, errorMessage: _errorMessage, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, onChange, onFocusChange,
    disabled, readOnly, required, invalid = false, ...rest
  }, ref) {
    const labelId = React.useId();
    const ariaProps = calendarProps({ ...rest, label, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, onChange, onFocusChange, disabled, readOnly, required, invalid }, 'Calendar', labelId);
    const frame = useDeferredCalendarFrame(ariaProps.value != null || ariaProps.defaultValue != null || ariaProps.focusedValue != null);
    if (frame.deferred) return calendarPlaceholderFrame({ ref, className: ariaProps.className, label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-calendar-cell' });
    const calendar = React.createElement(AriaCalendar<CalendarDate, 'single'>, {
      ...ariaProps,
      children: () => React.createElement(React.Fragment, null,
        label !== undefined ? React.createElement(AriaLabel, { id: labelId, className: 'muxui-field-label' }, label) : null,
        calendarHeader(),
        calendarGrid('muxui-calendar-cell', frame.reserve)),
    });
    return React.createElement(CalendarSelectionMotion, { rootRef: ref, children: calendar });
  });
  component.displayName = 'Calendar';
  return component;
})();

export const RangeCalendar: ForwardRefExoticComponent<RangeCalendarProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, RangeCalendarProps & DiscardedCalendarProps>(function RangeCalendar({
    label, description: _description, errorMessage: _errorMessage, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, isDateUnavailable: _upstreamDateUnavailable, onChange, onFocusChange,
    disabled = false, readOnly = false, required = false, invalid = false, className,
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...rest
  }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RangeCalendar');
    const labelId = React.useId();
    // MuxUIDateValue is any string, and an empty one counts as no date, so an end of '' reaches React Aria as
    // undefined, as it always has. React Aria types both ends as dates, so this states the ISO dates the contract asks for.
    const mapRange = (range: MuxUIDateRange | undefined) => range ? { start: dateValue(range.start, 'RangeCalendar'), end: dateValue(range.end, 'RangeCalendar') } as RangeValue<CalendarDate> : undefined;
    const frame = useDeferredCalendarFrame(value != null || defaultValue != null || dateValue(focusedValue, 'RangeCalendar') !== undefined);
    if (frame.deferred) return calendarPlaceholderFrame({ ref, className: classNames('muxui-range-calendar', className), label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-range-calendar-cell' });
    return React.createElement(AriaRangeCalendar<CalendarDate>, {
      ...rest,
      ref,
      value: value === null ? null : mapRange(value),
      defaultValue: mapRange(defaultValue),
      focusedValue: dateValue(focusedValue, 'RangeCalendar'),
      minValue: dateValue(minValue, 'RangeCalendar'),
      maxValue: dateValue(maxValue, 'RangeCalendar'),
      isDateUnavailable: dateUnavailableCallback(unavailableDateMatcher, 'RangeCalendar'),
      isDisabled: disabled,
      isReadOnly: readOnly,
      // React Aria's props do not name isRequired, though it passes the prop on, and TypeScript accepts such a key in a call only from a spread.
      ...{ isRequired: required },
      isInvalid: invalid ? invalid : undefined,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby ?? (label !== undefined ? labelId : undefined),
      className: classNames('muxui-range-calendar', className),
      onChange: (next) => { if (!disabled && !readOnly) onChange?.(next ? { start: serializeDateValue(next.start), end: serializeDateValue(next.end) } : undefined); },
      onFocusChange: (next) => { if (!disabled) onFocusChange?.(serializeDateValue(next)); },
    },
    label !== undefined ? React.createElement(AriaLabel, { id: labelId, className: 'muxui-field-label' }, label) : null,
    calendarHeader(),
    calendarGrid('muxui-range-calendar-cell', frame.reserve));
  });
  component.displayName = 'RangeCalendar';
  return component;
})();
