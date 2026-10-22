import React from 'react';
import { CalendarHeightMotion } from './calendar-height-motion.mjs';
import { CalendarSelectionCell, CalendarSelectionMotion } from './calendar-selection-motion.mjs';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import {
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  CalendarHeading as AriaCalendarHeading,
  CalendarStateContext,
  RangeCalendarStateContext,
  RangeCalendar as AriaRangeCalendar,
  Label as AriaLabel,
} from 'react-aria-components';
import { parseDate } from '@internationalized/date';
import { RangeSelectionMotion } from './range-selection-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';

function dateValue(value, name = 'Calendar') {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new TypeError(`${name} values must use YYYY-MM-DD ISO format`);
  try { return parseDate(value); } catch { throw new TypeError(`${name} values must use YYYY-MM-DD ISO format`); }
}

// null keeps a controlled value controlled and empty; undefined means uncontrolled.
function controlledDateValue(value, name) {
  return value === null ? null : dateValue(value, name);
}

function serializeDateValue(value) {
  return value ? String(value) : undefined;
}

function dateUnavailableCallback(callback, name) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') throw new TypeError(`${name} unavailableDateMatcher must be a function`);
  return (date) => Boolean(callback(serializeDateValue(date)));
}

const subscribeToNothing = () => () => {};
const useCalendarLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// False while hydrating server markup, true afterwards and for client-only mounts.
function useHydrated() {
  return React.useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

function placeholderCell(cellClass, key) {
  return React.createElement('td', { key, 'aria-hidden': 'true' }, React.createElement('div', { className: cellClass, 'data-muxui-calendar-placeholder': '' }, '\u00a0'));
}

// Server and client can disagree about today (clock and timezone), so day cells
// render only on the client. The server snapshot keeps hydration on blank,
// equally sized placeholder cells; client-only mounts render days at once.
// reserve keeps the six-week height of a deferred frame so hydration never shifts it.
function CalendarDays({ cellClass, reserve }) {
  const hydrated = useHydrated();
  // The reserve holds only until the first month change, which then animates normally.
  const calendarState = React.useContext(CalendarStateContext);
  const rangeState = React.useContext(RangeCalendarStateContext);
  const state = calendarState ?? rangeState;
  const month = state ? String(state.visibleRange.start) : '';
  const [initialMonth] = React.useState(month);
  const [reserveReleased, setReserveReleased] = React.useState(false);
  if (reserve !== undefined && !reserveReleased && month !== initialMonth) setReserveReleased(true);
  const grid = React.createElement(CalendarHeightMotion, null, React.createElement(AriaCalendarGrid, { className: 'muxui-calendar-grid' },
    React.createElement(AriaCalendarGridHeader, { className: 'muxui-calendar-grid-header' },
      (day) => React.createElement(AriaCalendarHeaderCell, { className: 'muxui-calendar-header-cell' }, day)),
    React.createElement(AriaCalendarGridBody, { className: 'muxui-calendar-grid-body' },
      (date) => !hydrated
        ? placeholderCell(cellClass)
        : cellClass === 'muxui-calendar-cell'
        ? React.createElement(AriaCalendarCell, { date, className: cellClass },
          (renderProps) => React.createElement(CalendarSelectionCell, renderProps))
        : React.createElement(AriaCalendarCell, { date, className: cellClass, 'data-muxui-date': String(date) })),
  ));
  const content = cellClass === 'muxui-range-calendar-cell' ? React.createElement(RangeSelectionMotion, null, grid) : grid;
  return reserve === undefined ? content : React.createElement('div', { style: reserveReleased ? undefined : { minHeight: reserve } }, content);
}

function calendarGrid(cellClass = 'muxui-calendar-cell', reserve) {
  return React.createElement(CalendarDays, { cellClass, reserve });
}

// Without value, defaultValue, or focusedValue, React Aria shows the month of
// today, which server and browser may disagree on. Such calendars hydrate a
// date-free frame (label, header, blank heading, six blank weeks) and render the
// real calendar after hydration, keeping the six-week height until the month changes.
function useDeferredCalendarFrame(anchored) {
  const deferred = !useHydrated() && !anchored;
  const gridRef = React.useRef(null);
  const [reserve, setReserve] = React.useState(undefined);
  useCalendarLayoutEffect(() => {
    if (deferred && gridRef.current) setReserve(gridRef.current.getBoundingClientRect().height);
  }, [deferred]);
  return { deferred, gridRef, reserve };
}

// ref receives the frame root, a div like the real calendar root that replaces it.
function calendarPlaceholderFrame({ ref, className, label, labelId, gridRef, cellClass }) {
  const icon = (Icon) => React.createElement(Icon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' });
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

function calendarProps(props, name, labelId) {
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
    isInvalid: invalid || undefined,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby ?? (label !== undefined ? labelId : undefined),
    className: classNames(`muxui-${name.toLowerCase()}`, className),
    onChange: (next) => { if (!disabled && !readOnly) onChange?.(serializeDateValue(next)); },
    onFocusChange: (next) => { if (!disabled) onFocusChange?.(serializeDateValue(next)); },
  };
}

export const Calendar = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Calendar(props, ref) {
    const { label, description: _description, errorMessage: _errorMessage, ...rest } = props;
    const labelId = React.useId();
    const ariaProps = calendarProps({ ...rest, label }, 'Calendar', labelId);
    const frame = useDeferredCalendarFrame(ariaProps.value != null || ariaProps.defaultValue != null || ariaProps.focusedValue != null);
    if (frame.deferred) return calendarPlaceholderFrame({ ref, className: ariaProps.className, label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-calendar-cell' });
    const calendar = React.createElement(AriaCalendar, ariaProps,
      () => React.createElement(React.Fragment, null,
        label !== undefined ? React.createElement(AriaLabel, { id: labelId, className: 'muxui-field-label' }, label) : null,
        calendarHeader(),
        calendarGrid('muxui-calendar-cell', frame.reserve)));
    return React.createElement(CalendarSelectionMotion, { rootRef: ref }, calendar);
  });
  component.displayName = 'Calendar';
  return component;
})();

export const RangeCalendar = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function RangeCalendar(props, ref) {
    const { label, description: _description, errorMessage: _errorMessage, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, isDateUnavailable: _upstreamDateUnavailable, onChange, onFocusChange,
      disabled = false, readOnly = false, required = false, invalid = false, className,
      'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...rest } = props;
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RangeCalendar');
    const labelId = React.useId();
    const mapRange = (range) => range ? { start: dateValue(range.start, 'RangeCalendar'), end: dateValue(range.end, 'RangeCalendar') } : undefined;
    const frame = useDeferredCalendarFrame(value != null || defaultValue != null || dateValue(focusedValue, 'RangeCalendar') !== undefined);
    if (frame.deferred) return calendarPlaceholderFrame({ ref, className: classNames('muxui-range-calendar', className), label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-range-calendar-cell' });
    return React.createElement(AriaRangeCalendar, {
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
      isRequired: required,
      isInvalid: invalid || undefined,
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
