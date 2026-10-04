import React from 'react';
import { CalendarHeightMotion } from './calendar-height-motion.mjs';
import { CalendarSelectionCell, CalendarSelectionMotion } from './calendar-selection-motion.mjs';
import { ColorSliderMotionTrack } from './color-slider-motion.mjs';
import { ColorWheelMotionTrack } from './color-wheel-motion.mjs';
import { ListBoxMotion } from './listbox-motion.mjs';
import { TreeMotion } from './tree-motion.mjs';
import { GridListMotion } from './grid-list-motion.mjs';
import { MenuMotion } from './menu-motion.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import {
  Calendar as AriaCalendar,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  CalendarHeading as AriaCalendarHeading,
  ColorArea as AriaColorArea,
  ColorField as AriaColorField,
  ColorPicker as AriaColorPicker,
  ColorPickerStateContext,
  ColorSlider as AriaColorSlider,
  ColorSwatch as AriaColorSwatch,
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
  ColorWheel as AriaColorWheel,
  ColorThumb as AriaColorThumb,
  ComboBox as AriaComboBox,
  ComboBoxValue as AriaComboBoxValue,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger as AriaMenuTrigger,
  SubmenuTrigger as AriaSubmenuTrigger,
  Separator as AriaSeparator,
  Header as AriaHeader,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  RangeCalendar as AriaRangeCalendar,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Column as AriaColumn,
  Row as AriaRow,
  Cell as AriaCell,
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanels as AriaTabPanels,
  TabPanel as AriaTabPanel,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Tag as AriaTag,
  ToggleButtonGroup as AriaToggleButtonGroup,
  TokenField as AriaTokenField,
  TokenInput as AriaTokenInput,
  Token as AriaToken,
  Toolbar as AriaToolbar,
  Virtualizer as AriaVirtualizer,
  ListLayout,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  Group as AriaGroup,
  TreeItemContent as AriaTreeItemContent,
  Label as AriaLabel,
  Input as AriaInput,
  Text as AriaText,
  FieldError as AriaFieldError,
  Button as AriaButton,
  parseColor,
  useLocale,
  TokenFieldValue,
} from 'react-aria-components';
import { normalizeToggleButtonSize, ToggleButtonSizeContext } from './toggle-button-context.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { parseDate } from '@internationalized/date';
import { overlayGeometry, normalizeBoolean } from './overlay-positioning.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { RangeSelectionMotion } from './range-selection-motion.mjs';
import { RadioGroupMotion, RadioMotionIndicator } from './radio-motion.mjs';
import { SliderMotionTrack } from './slider-motion.mjs';
import { TabsMotion } from './tabs-motion.mjs';
import { ToggleButtonGroupMotion } from './toggle-button-group-motion.mjs';
import { IconButton } from './supplemental/icon-button.mjs';

function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
}

const TABS_VARIANTS = new Set(['underline', 'pill', 'overflow', 'segment']);

function normalizeTabsVariant(value = 'underline') {
  if (!TABS_VARIANTS.has(value)) {
    throw new TypeError('Tabs variant must be one of: underline, pill, overflow, segment');
  }
  return value;
}

function textContent(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement(value)) return textContent(value.props.children);
  return '';
}

function normalizeItems(items = []) {
  const used = new Set();
  return items.map((item, index) => {
    const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const label = source.label ?? source.name ?? source.value ?? id;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id) };
  });
}

function keySet(value) {
  return value === undefined ? undefined : value === 'all' ? 'all' : new Set((value ?? []).map(String));
}

function keyList(value) {
  return value === 'all' ? 'all' : [...(value ?? [])].map(String);
}

function readonlyKeyArray(value, property) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${property} must be a readonly string array`);
  }
  return [...value];
}

function readonlyKeySet(value, property, selectionMode) {
  if (selectionMode !== 'single' && selectionMode !== 'multiple') {
    throw new TypeError('ToggleButtonGroup selectionMode must be single or multiple');
  }
  const keys = readonlyKeyArray(value, property);
  if (keys && selectionMode === 'single' && keys.length > 1) {
    throw new TypeError(`${property} must contain at most one ID in single selection mode`);
  }
  return keys === undefined ? undefined : new Set(keys);
}

function accessibleName(props, componentName) {
  const { label, ariaLabel, ariaLabelledby } = props;
  if ((label === undefined || label === null || label === '') && !ariaLabel && !ariaLabelledby) {
    throw new TypeError(`${componentName} requires label, aria-label, or aria-labelledby`);
  }
}

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

function colorValue(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new TypeError(`${name} values must be Mux UI color strings`);
  try { return parseColor(value); } catch { throw new TypeError(`${name} values must be valid CSS color strings`); }
}

// RAC's ColorPicker does not propagate disabled/read-only state through
// arbitrary child layout, so MuxUI owns that propagation separately. A
// context keeps fragments and wrapper elements transparent to the contract.
const ColorPickerContext = React.createContext({ disabled: false, readOnly: false });

const readOnlyInteractionEvents = [
  'beforeinput', 'change', 'click', 'input', 'keydown', 'mousedown', 'mousemove',
  'pointerdown', 'pointermove', 'touchstart', 'touchmove',
];
const readOnlyTargetGuards = new WeakMap();

// Read-only controls stay focusable and navigable. Keys that change the value are
// blocked with any modifier, because React Aria acts on them regardless; Tab and
// Escape are never blocked.
const READ_ONLY_ADJUSTMENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
// Swatch pickers move focus with arrows, so only the selection keys are blocked.
const READ_ONLY_SELECTION_KEYS = new Set(['Enter', ' ']);

function readOnlyBlocksKey(event, keys) {
  return keys.has(event.key);
}

function readOnlyKeyGuard(readOnly, keys = READ_ONLY_ADJUSTMENT_KEYS) {
  return (event) => {
    if (readOnly && readOnlyBlocksKey(event, keys)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

function setReadOnlyTargetGuard(target, readOnly) {
  const existingGuard = readOnlyTargetGuards.get(target);
  if (readOnly && !existingGuard) {
    const keys = target.getAttribute('role') === 'listbox' ? READ_ONLY_SELECTION_KEYS : READ_ONLY_ADJUSTMENT_KEYS;
    const guard = (event) => {
      if (event.type === 'keydown' && !readOnlyBlocksKey(event, keys)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    for (const eventName of readOnlyInteractionEvents) target.addEventListener(eventName, guard, true);
    readOnlyTargetGuards.set(target, guard);
  } else if (!readOnly && existingGuard) {
    for (const eventName of readOnlyInteractionEvents) target.removeEventListener(eventName, existingGuard, true);
    readOnlyTargetGuards.delete(target);
  }
}

function updateReadOnlyTargets(scope, readOnly, selector) {
  if (!scope) return;
  const targets = [
    ...(scope.matches(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];
  for (const target of targets) {
    if (readOnly) {
      target.setAttribute('aria-readonly', 'true');
      target.setAttribute('data-readonly', 'true');
    } else {
      target.removeAttribute('aria-readonly');
      target.removeAttribute('data-readonly');
    }
    setReadOnlyTargetGuard(target, readOnly);
  }
}

function useReadOnlyTargets(forwardedRef, readOnly, selector) {
  const scopeRef = React.useRef(null);
  const assignRef = React.useCallback((node) => {
    scopeRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    // SSR can carry owned root/thumb data markers. RAC-private range inputs are
    // decorated by this callback during commit, so no private internals/imports
    // are needed to expose readOnly semantics on the actual targets.
    updateReadOnlyTargets(node, readOnly, selector);
  }, [forwardedRef, readOnly, selector]);
  const useReadOnlyLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
  useReadOnlyLayoutEffect(() => {
    updateReadOnlyTargets(scopeRef.current, readOnly, selector);
  }, [readOnly, selector]);
  return assignRef;
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
  return reserve === undefined ? content : React.createElement('div', { style: { minHeight: reserve } }, content);
}

function calendarGrid(cellClass = 'muxui-calendar-cell', reserve) {
  return React.createElement(CalendarDays, { cellClass, reserve });
}

// Without value, defaultValue, or focusedValue, React Aria shows the month of
// today, which server and browser may disagree on. Such calendars hydrate a
// date-free frame (label, header, blank heading, six blank weeks) and render the
// real calendar after hydration, keeping the six-week height as a reserve.
function useDeferredCalendarFrame(anchored) {
  const deferred = !useHydrated() && !anchored;
  const gridRef = React.useRef(null);
  const [reserve, setReserve] = React.useState(undefined);
  useCalendarLayoutEffect(() => {
    if (deferred && gridRef.current) setReserve(gridRef.current.getBoundingClientRect().height);
  }, [deferred]);
  return { deferred, gridRef, reserve };
}

function calendarPlaceholderFrame({ className, label, labelId, gridRef, cellClass }) {
  const icon = (Icon) => React.createElement(Icon, { className: 'muxui-icon muxui-icon--sm', 'aria-hidden': 'true', focusable: 'false' });
  const days = Array.from({ length: 7 }, (_, index) => index);
  return React.createElement('div', { className, 'data-muxui-calendar-placeholder': '' },
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
    if (frame.deferred) return calendarPlaceholderFrame({ className: ariaProps.className, label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-calendar-cell' });
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
    if (frame.deferred) return calendarPlaceholderFrame({ className: classNames('muxui-range-calendar', className), label, labelId, gridRef: frame.gridRef, cellClass: 'muxui-range-calendar-cell' });
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

export const ColorSwatch = React.forwardRef(function ColorSwatch({ color, secondaryColor, shape = 'square', colorName, disabled = false, className, style, ...props }, ref) {
  const pickerState = React.useContext(ColorPickerContext);
  const { locale } = useLocale();
  if (shape !== 'square' && shape !== 'circle') throw new TypeError('ColorSwatch shape must be square or circle');
  const primary = colorValue(color, 'ColorSwatch');
  const secondary = colorValue(secondaryColor, 'ColorSwatch secondaryColor');
  if (secondary && !primary) throw new TypeError('Two-tone ColorSwatch requires a primary color');
  const effectiveDisabled = disabled || pickerState.disabled;
  return React.createElement(AriaColorSwatch, {
    ...props, ref, color: primary,
    colorName: colorName?.trim() || (secondary ? `${primary.getColorName(locale)}, ${secondary.getColorName(locale)}` : undefined),
    isDisabled: effectiveDisabled,
    'data-disabled': effectiveDisabled || undefined, 'data-readonly': pickerState.readOnly || undefined,
    'data-muxui-color-paint': 'sample',
    'data-shape': shape, 'data-two-tone': secondary ? '' : undefined,
    className: classNames('muxui-color-swatch', className),
    style: secondary ? {
      ...style,
      // Avoid painting translucent gradient halves over the primary colour.
      backgroundColor: 'transparent',
      '--muxui-color-swatch-primary': primary.toString('css'),
      '--muxui-color-swatch-secondary': secondary.toString('css'),
    } : style,
  });
});
ColorSwatch.displayName = 'ColorSwatch';

// React Aria reads isInvalid: false as controlled-valid, which hides failed native
// validation, so these fields pass isInvalid only when invalid is set. errorMessage
// replaces the shown message and never makes a field invalid by itself.
export const ColorField = React.forwardRef(function ColorField({ label, description, errorMessage, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, size, name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorField');
  const resolvedSize = normalizeChoiceControlSize(size, 'ColorField');
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  return React.createElement(AriaColorField, {
    ...props, ref, name, value: value === null ? null : colorValue(value, 'ColorField'), defaultValue: colorValue(defaultValue, 'ColorField'),
    onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next ? next.toString() : null); }, isDisabled: effectiveDisabled, isReadOnly: effectiveReadOnly, isRequired: required,
    isInvalid: invalid || undefined, className: classNames('muxui-color-field', className), 'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
  }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
  React.createElement(AriaInput, { className: 'muxui-field-input' }),
  description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
  errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null);
});
ColorField.displayName = 'ColorField';

// Colour controls forward no untyped props; upstream props such as onChangeEnd,
// xChannel, or colorSpace would bypass the Mux UI guards and string values.
export const ColorArea = React.forwardRef(function ColorArea({ label, value, defaultValue, onChange, disabled = false, readOnly = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorArea');
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  const labelId = React.useId();
  const labelledby = ariaLabelledby ?? (label !== undefined ? labelId : undefined);
  const assignAreaRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
  const preventReadOnlyInteraction = (event) => {
    if (effectiveReadOnly) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return React.createElement('div', { className: 'muxui-color-area-field', 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, 'aria-disabled': effectiveDisabled || undefined, onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
    label !== undefined ? React.createElement('span', { id: labelId, className: 'muxui-field-label' }, label) : null,
    React.createElement(AriaColorArea, {
      ref: assignAreaRef,
      value: colorValue(value, 'ColorArea'),
      defaultValue: colorValue(defaultValue, 'ColorArea'),
      onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
      isDisabled: effectiveDisabled,
      'aria-label': ariaLabel,
      'aria-labelledby': labelledby,
      'data-readonly': effectiveReadOnly || undefined,
      'data-muxui-color-paint': 'area',
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly),
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-color-area', className),
    }, React.createElement(AriaColorThumb, {
      className: 'muxui-color-area-thumb',
      'data-muxui-color-paint': 'sample',
      'data-readonly': effectiveReadOnly || undefined,
    })),
  );
});
ColorArea.displayName = 'ColorArea';

const COLOR_SPACE_CHANNELS = {
  rgb: ['red', 'green', 'blue', 'alpha'],
  hsl: ['hue', 'saturation', 'lightness', 'alpha'],
  hsb: ['hue', 'saturation', 'brightness', 'alpha'],
};

// Without colorSpace, React Aria reads the channel from the value's own space.
function assertColorSliderChannel(channel, colorSpace, color) {
  // Computed per call so the module keeps no import-time work.
  const channels = [...new Set(Object.values(COLOR_SPACE_CHANNELS).flat())];
  if (!channels.includes(channel)) throw new TypeError(`ColorSlider channel must be one of: ${channels.join(', ')}`);
  if (colorSpace !== undefined && !Object.hasOwn(COLOR_SPACE_CHANNELS, colorSpace)) throw new TypeError('ColorSlider colorSpace must be one of: rgb, hsl, hsb');
  const space = colorSpace ?? color?.getColorSpace();
  if (space && !COLOR_SPACE_CHANNELS[space].includes(channel)) {
    throw new TypeError(`ColorSlider channel ${channel} is not in the ${space} color space; set colorSpace to ${Object.keys(COLOR_SPACE_CHANNELS).filter((key) => COLOR_SPACE_CHANNELS[key].includes(channel)).join(' or ')}`);
  }
}

// Include displayName in the pure initialization so unused sliders shed their motion dependency.
export const ColorSlider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function ColorSlider({ label, value, defaultValue, onChange, channel = 'red', colorSpace, disabled = false, readOnly = false, orientation = 'horizontal', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorSlider');
    const color = colorValue(value, 'ColorSlider');
    const defaultColor = colorValue(defaultValue, 'ColorSlider');
    // Inside a ColorPicker, React Aria drives the slider with the picker's colour.
    const pickerColor = React.useContext(ColorPickerStateContext)?.color;
    assertColorSliderChannel(channel, colorSpace, pickerColor ?? color ?? defaultColor);
    const pickerState = React.useContext(ColorPickerContext);
    const effectiveDisabled = disabled || pickerState.disabled;
    const effectiveReadOnly = readOnly || pickerState.readOnly;
    const preventReadOnlyInteraction = (event) => {
      if (effectiveReadOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const assignSliderRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
    return React.createElement('div', { 'aria-disabled': effectiveDisabled || undefined, 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, onPointerDownCapture: preventReadOnlyInteraction, onMouseDownCapture: preventReadOnlyInteraction, onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly), onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
      React.createElement(AriaColorSlider, {
        ref: assignSliderRef,
        channel,
        colorSpace,
        value: color,
        defaultValue: defaultColor,
        onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
        isDisabled: effectiveDisabled,
        orientation,
        'data-readonly': effectiveReadOnly || undefined,
        className: classNames('muxui-color-slider', className),
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledby,
      },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(ColorSliderMotionTrack, { readOnly: effectiveReadOnly })),
    );
  });
  component.displayName = 'ColorSlider';
  return component;
})();

function assertColorWheelGeometry(outerRadius, innerRadius) {
  if (typeof outerRadius !== 'number' || !Number.isFinite(outerRadius) || outerRadius < 0) throw new TypeError('ColorWheel outerRadius must be a finite nonnegative number');
  if (typeof innerRadius !== 'number' || !Number.isFinite(innerRadius) || innerRadius < 0) throw new TypeError('ColorWheel innerRadius must be a finite nonnegative number');
  if (innerRadius >= outerRadius) throw new TypeError('ColorWheel innerRadius must be less than outerRadius');
}

export const ColorWheel = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function ColorWheel({ value, defaultValue, onChange, disabled = false, readOnly = false, className, outerRadius = 96, innerRadius = 64, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    if (!ariaLabel && !ariaLabelledby) throw new TypeError('ColorWheel requires aria-label or aria-labelledby');
    assertColorWheelGeometry(outerRadius, innerRadius);
    const pickerState = React.useContext(ColorPickerContext);
    const effectiveDisabled = disabled || pickerState.disabled;
    const effectiveReadOnly = readOnly || pickerState.readOnly;
    const preventReadOnlyInteraction = (event) => {
      if (effectiveReadOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const assignWheelRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
    return React.createElement(AriaColorWheel, {
      ref: assignWheelRef,
      outerRadius,
      innerRadius,
      value: colorValue(value, 'ColorWheel'),
      defaultValue: colorValue(defaultValue, 'ColorWheel'),
      onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
      isDisabled: effectiveDisabled,
      'aria-disabled': effectiveDisabled || undefined,
      'data-disabled': effectiveDisabled || undefined,
      'data-readonly': effectiveReadOnly || undefined,
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly),
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      className: classNames('muxui-color-wheel', className),
    },
      React.createElement(ColorWheelMotionTrack, { readOnly: effectiveReadOnly }));
  });
  component.displayName = 'ColorWheel';
  return component;
})();

export const ColorPicker = React.forwardRef(function ColorPicker({ value, defaultValue, onChange, disabled = false, readOnly = false, children, className, ...props }, ref) {
  // ARIA names and states need a role; a labelled picker is a group, an unlabelled one a plain wrapper.
  const labelled = Boolean(props['aria-label'] || props['aria-labelledby']);
  return React.createElement('div', { ...props, ref, role: labelled ? 'group' : undefined, 'aria-disabled': (labelled && disabled) || undefined, 'data-disabled': disabled || undefined, 'data-readonly': readOnly || undefined, className: classNames('muxui-color-picker', className) }, React.createElement(AriaColorPicker, { value: colorValue(value, 'ColorPicker'), defaultValue: colorValue(defaultValue, 'ColorPicker'), onChange: (next) => { if (!disabled && !readOnly) onChange?.(next.toString()); } }, React.createElement(ColorPickerContext.Provider, { value: { disabled, readOnly } }, children)));
});
ColorPicker.displayName = 'ColorPicker';

// React Aria keys swatch options by colour, so each item needs a distinct colour.
// An explicit item label or textValue becomes the swatch colour name.
function colorSwatchItems(items) {
  const seen = new Set();
  return normalizeItems(items).map((item, index) => {
    const color = colorValue(item.color ?? item.value, 'ColorSwatchPicker');
    const key = color?.toString('hexa');
    if (seen.has(key)) throw new TypeError(`ColorSwatchPicker items must have distinct colors: ${item.id}`);
    seen.add(key);
    const source = items[index];
    const named = source && typeof source === 'object' && (source.textValue !== undefined || source.label !== undefined);
    return { ...item, color, colorName: named ? item.textValue : undefined };
  });
}

// React Aria treats a null swatch value as uncontrolled, so a controlled empty
// picker selects a transparent black that no item uses.
function unusedSwatchColor(items) {
  const used = new Set(items.map((item) => item.color?.toString('hexa')));
  for (let alpha = 0; alpha < 256; alpha += 1) {
    const color = parseColor(`#000000${alpha.toString(16).padStart(2, '0')}`);
    if (!used.has(color.toString('hexa'))) return color;
  }
  throw new TypeError('ColorSwatchPicker cannot represent an empty value for these items');
}

export const ColorSwatchPicker = React.forwardRef(function ColorSwatchPicker({ items = [], value, defaultValue, onChange, disabled = false, readOnly = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = colorSwatchItems(items);
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  accessibleName({ ariaLabel, ariaLabelledby }, 'ColorSwatchPicker');
  const preventReadOnlyInteraction = (event) => {
    if (effectiveReadOnly) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const assignSwatchPickerRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="listbox"]');
  return React.createElement(
    'div',
    {
      'aria-disabled': effectiveDisabled || undefined,
      'data-disabled': effectiveDisabled || undefined,
      'data-readonly': effectiveReadOnly || undefined,
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly, READ_ONLY_SELECTION_KEYS),
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
    },
    React.createElement(
      AriaColorSwatchPicker,
      {
        ref: assignSwatchPickerRef,
        value: value === null ? unusedSwatchColor(normalized) : colorValue(value, 'ColorSwatchPicker'),
        defaultValue: colorValue(defaultValue, 'ColorSwatchPicker'),
        onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
        isDisabled: effectiveDisabled,
        'data-readonly': effectiveReadOnly || undefined,
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledby,
        className: classNames('muxui-color-swatch-picker', className),
      },
      normalized.map((item) => React.createElement(
        AriaColorSwatchPickerItem,
        {
          key: item.id,
          color: item.color,
          id: item.id,
          isDisabled: effectiveDisabled || item.disabled,
          'data-readonly': effectiveReadOnly || undefined,
          className: 'muxui-color-swatch-picker-item',
        },
        React.createElement(AriaColorSwatch, {
          color: item.color,
          colorName: item.colorName,
          isDisabled: effectiveDisabled || item.disabled,
          'data-disabled': effectiveDisabled || item.disabled || undefined,
          'data-muxui-color-paint': 'sample',
          className: 'muxui-color-swatch',
        }),
      )),
    ),
  );
});
ColorSwatchPicker.displayName = 'ColorSwatchPicker';

function collectionProps(props, componentName) {
  const { items = [], selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children: _children, className, ...rest } = props;
  const normalized = normalizeItems(items);
  accessibleName({ ariaLabel: rest['aria-label'], ariaLabelledby: rest['aria-labelledby'] }, componentName);
  const disabledKeys = disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
  return { normalized, rest, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onAction, selectionMode, className: classNames(`muxui-${componentName}`, className), disabled, disabledKeys };
}

const ListBoxContext = React.createContext({ disabled: false });

function collectionItem(id) {
  return { id: String(id), key: String(id), value: String(id) };
}

// Keep component creation and metadata local so unused motion can be removed.
export const ListBox = /*#__PURE__*/ (() => {
  const ListBox = React.forwardRef(function ListBoxRoot({ items = [], selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children, className, style, layout = 'stack', orientation = 'vertical', ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ListBox');
    if (layout !== 'stack' && layout !== 'grid') throw new TypeError('ListBox layout must be stack or grid');
    if (orientation !== 'vertical' && orientation !== 'horizontal') throw new TypeError('ListBox orientation must be vertical or horizontal');
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    const disabledKeys = new Set(normalized.filter((item) => disabled || item.disabled).map((item) => item.id));
    const actionProps = onAction ? {
      onAction: (key) => {
        const item = normalized.find((candidate) => candidate.id === String(key));
        if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
      },
    } : {};
    const listBox = React.createElement(AriaListBox, {
      ...props, items: hasChildren ? undefined : normalized, selectionMode,
      selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), disabledKeys,
      onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
      ...actionProps,
      'data-disabled': disabled || undefined, 'aria-disabled': disabled || undefined,
      layout, orientation, style, className: classNames('muxui-list-box', className),
    }, hasChildren ? children : (item) => React.createElement(ListBox.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    return React.createElement(ListBoxContext.Provider, { value: { disabled } },
      React.createElement(ListBoxMotion, { selectionMode, rootRef: ref }, listBox));
  });
  ListBox.displayName = 'ListBox';
  ListBox.Root = ListBox;
  ListBox.Section = React.forwardRef(function ListBoxSection({ children, className, title, ...props }, ref) {
    return React.createElement(AriaListBoxSection, { ...props, ref, className: classNames('muxui-list-box-section', className) },
      title !== undefined ? React.createElement(ListBox.Header, null, title) : null, children);
  });
  ListBox.Header = React.forwardRef(function ListBoxHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-list-box-section-header', className) }, children);
  });
  ListBox.Item = React.forwardRef(function ListBoxItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(ListBoxContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaListBoxItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-list-box-item', className) }, children);
  });
  return ListBox;
})();

export const GridList = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function GridList(props, ref) {
    const { normalized, rest, selectedKeys, defaultSelectedKeys, onSelectionChange, onAction, selectionMode, className, disabled, disabledKeys } = collectionProps(props, 'grid-list');
    const gridList = React.createElement(AriaGridList, {
      ...rest,
      items: normalized,
      selectionMode,
      selectedKeys,
      defaultSelectedKeys,
      disabledKeys,
      onSelectionChange,
      // A RAC action handler turns presses into actions while nothing is
      // selected, so only consumer actions may suppress press selection.
      ...(onAction ? {
        onAction: (key) => {
          const item = normalized.find((candidate) => candidate.id === String(key));
          if (!disabled && !item?.disabled) onAction(item);
        },
      } : {}),
      isDisabled: disabled,
      'aria-disabled': disabled || undefined,
      className,
    }, (item) => React.createElement(AriaGridListItem, {
      id: item.id,
      textValue: item.textValue,
      isDisabled: disabled || item.disabled,
      'data-disabled': disabled || item.disabled || undefined,
      'aria-disabled': disabled || item.disabled || undefined,
      className: 'muxui-grid-list-item',
    }, item.label));
    return React.createElement(GridListMotion, { rootRef: ref }, gridList);
  });
  component.displayName = 'GridList';
  return component;
})();

// RAC supplies trigger semantics while Mux preserves native button handlers and refs.
const CollectionTrigger = React.forwardRef(function CollectionTrigger({ children, disabled, onActivate, className, ...nativeProps }, ref) {
  const eventProps = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => /^on[A-Z]/u.test(key)));
  const attributes = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => !/^on[A-Z]/u.test(key)));
  return React.createElement(AriaButton, {
    ...attributes, ref, isDisabled: disabled, className,
    onPress: onActivate ? (event) => { if (!disabled) onActivate({ type: 'activate', pointerType: event.pointerType, target: event.target }); } : undefined,
    render: (buttonProps) => {
      const merged = { ...nativeProps, ...buttonProps };
      for (const [name, handler] of Object.entries(eventProps)) {
        if (typeof handler !== 'function') continue;
        const internal = buttonProps[name];
        merged[name] = internal ? (event) => { handler(event); if (!event.defaultPrevented) internal(event); } : handler;
      }
      return React.createElement('button', merged);
    },
  }, children);
});

export const Menu = /*#__PURE__*/ (() => {
  const Menu = React.forwardRef(function Menu(props, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Menu');
    return React.createElement(MenuList, { ...props, ref, standalone: true });
  });
  Menu.displayName = 'Menu';

  const MenuContext = React.createContext({ disabled: false });
  const MenuSubmenuContext = React.createContext(false);

  const MenuRoot = React.forwardRef(function MenuRoot({ open, defaultOpen = false, onOpenChange, onAction, onSelect, disabled = false, shouldCloseOnSelect = true, className, children, ...props }, ref) {
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const currentOpen = !disabled && (open ?? internalOpen);
    const setOpen = (next) => {
      if (disabled && next) return;
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    };
    const context = { disabled, shouldCloseOnSelect, onAction, onSelect };
    return React.createElement(MenuContext.Provider, { value: context },
      React.createElement(MenuSubmenuContext.Provider, { value: false },
        React.createElement(AriaMenuTrigger, { isOpen: currentOpen, onOpenChange: setOpen },
          React.createElement('div', { ...props, ref, className: classNames('muxui-menu-root', className), 'data-open': currentOpen || undefined, 'data-disabled': disabled || undefined }, children))));
  });

  const MenuTrigger = React.forwardRef(function MenuTrigger({ disabled = false, onActivate, className, children, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, onActivate, className: classNames('muxui-menu-trigger', className) }, children);
  });

  const MenuPopup = /*#__PURE__*/ React.forwardRef(function MenuPopup({ children, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, className, ...props }, ref) {
    const submenu = React.useContext(MenuSubmenuContext);
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, { placement: submenu ? 'end-top' : 'bottom-start', offset: 4, crossOffset: 0, shouldFlip: true, containerPadding: 12 }, 'Menu.Popup');
    return React.createElement(PopoverMotion, { ...props, ...geometry, ref, triggerRef: anchorRef, isNonModal: !normalizeBoolean(modal, true, 'Menu.Popup modal'), className: classNames('muxui-menu-popup', className) }, children);
  });

  const MenuList = React.forwardRef(function MenuList({ items = [], children, disabled = false, shouldCloseOnSelect, onAction, onSelect, className, standalone = false, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = context.disabled || disabled;
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    const disabledKeys = new Set(normalized.filter((item) => effectiveDisabled || item.disabled).map((item) => item.id));
    const menu = React.createElement(AriaMenu, {
      ...props,
      items: hasChildren ? undefined : normalized,
      disabledKeys,
      shouldCloseOnSelect: shouldCloseOnSelect ?? context.shouldCloseOnSelect ?? true,
      onAction: (key) => {
        const item = normalized.find((candidate) => candidate.id === String(key)) ?? collectionItem(key);
        if (!effectiveDisabled && !item.disabled) {
          onAction?.(item);
          onSelect?.(item);
          context.onAction?.(item);
          context.onSelect?.(item);
        }
      },
      'data-disabled': effectiveDisabled || undefined,
      'aria-disabled': effectiveDisabled || undefined,
      className: classNames(standalone ? 'muxui-menu' : 'muxui-menu muxui-menu-list', className),
    }, hasChildren ? children : (item) => React.createElement(MenuItem, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    return React.createElement(MenuContext.Provider, { value: { ...context, disabled: effectiveDisabled } },
      React.createElement(MenuMotion, { rootRef: ref }, menu));
  });

  const MenuItem = React.forwardRef(function MenuItem({ children, id, textValue, disabled = false, className, onAction, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaMenuItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, onAction: onAction ? () => { if (!effectiveDisabled) onAction(); } : undefined, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-menu-item', className) }, children);
  });

  const MenuSection = React.forwardRef(function MenuSection({ children, title, className, ...props }, ref) {
    return React.createElement(AriaMenuSection, { ...props, ref, className: classNames('muxui-menu-section', className) },
      title !== undefined ? React.createElement(MenuHeader, null, title) : null, children);
  });

  const MenuHeader = React.forwardRef(function MenuHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-menu-section-header', className) }, children);
  });

  const MenuSeparator = React.forwardRef(function MenuSeparator({ className, ...props }, ref) {
    return React.createElement(AriaSeparator, { ...props, ref, elementType: 'hr', className: classNames('muxui-menu-separator', className) });
  });

  function MenuSubmenu({ children, delay = 200 }) {
    if (!Number.isFinite(delay) || delay < 0) throw new TypeError('Menu.Submenu delay must be a nonnegative finite number');
    const pair = React.Children.toArray(children);
    if (pair.length !== 2 || !pair.every(React.isValidElement)) throw new TypeError('Menu.Submenu requires an item and a popup');
    return React.createElement(MenuSubmenuContext.Provider, { value: true }, React.createElement(AriaSubmenuTrigger, { delay }, pair));
  }

  Menu.Root = MenuRoot;
  Menu.Trigger = MenuTrigger;
  Menu.Popup = MenuPopup;
  Menu.List = MenuList;
  Menu.Item = MenuItem;
  Menu.Submenu = MenuSubmenu;
  Menu.Section = MenuSection;
  Menu.Header = MenuHeader;
  Menu.Separator = MenuSeparator;
  return Menu;
})();

export const ComboBox = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function ComboBox({ label, description, errorMessage, items = [], value, defaultValue, selectedId, defaultSelectedId, onChange, onSelect, disabled = false, readOnly = false, required = false, invalid = false, placeholder, size, name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ComboBox');
    const resolvedSize = normalizeChoiceControlSize(size, 'ComboBox');
    const normalized = normalizeItems(items);
    const disabledKeys = new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
    const handleSelection = (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (item && !item.disabled && !disabled && !readOnly) onSelect?.(item); };
    // defaultItems lets React Aria filter options by the typed text; items would mean consumer-filtered.
    return React.createElement(AriaComboBox, { ...props, ref, defaultItems: normalized, disabledKeys, ...(value === undefined ? {} : { inputValue: value }), defaultInputValue: defaultValue, selectedKey: selectedId, defaultSelectedKey: defaultSelectedId, onInputChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, name, className: classNames('muxui-combo-box', className), 'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(AriaGroup, { className: 'muxui-combo-control' },
        React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
        React.createElement(IconButton, { className: 'muxui-combo-box-trigger', 'aria-label': 'Show options' },
          React.createElement(ChevronDownIcon, { className: 'muxui-combo-box-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
      description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
      errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
      React.createElement(PopoverMotion, { className: 'muxui-combo-box-popover', 'data-size': resolvedSize }, React.createElement(AriaListBox, { items: normalized, className: 'muxui-combo-box-list', 'data-size': resolvedSize }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, isDisabled: item.disabled, 'data-disabled': item.disabled || undefined, 'aria-disabled': item.disabled || undefined, className: 'muxui-combo-box-option' }, item.label))),
    );
  });
  component.displayName = 'ComboBox';
  return component;
})();

const SelectContext = React.createContext({ disabled: false });

function selectChildrenProvideLabel(children) {
  return React.Children.toArray(children).some((child) => React.isValidElement(child)
    && (child.type === Select.Label
      ? Boolean(textContent(child.props.children).trim())
      : selectChildrenProvideLabel(child.props.children)));
}

export const Select = /*#__PURE__*/ (() => {
  const Select = React.forwardRef(function SelectRoot({ label, description, errorMessage, items = [], value, defaultValue, open, defaultOpen = false, onOpenChange, onChange, disabled = false, readOnly = false, required = false, invalid = false, placeholder = 'Select an option', selectedContent, trigger, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, size, name, children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    if (!selectChildrenProvideLabel(children)) accessibleName({ label, ariaLabel, ariaLabelledby }, 'Select');
    if (trigger !== undefined && (!React.isValidElement(trigger) || trigger.type !== 'button')) throw new TypeError('Select trigger must be a native button element');
    const resolvedSize = normalizeChoiceControlSize(size, 'Select');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, { placement: 'bottom-start', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12 }, 'Select');
    const isModal = normalizeBoolean(modal, true, 'Select modal');
    const [internalSelectedKey, setInternalSelectedKey] = React.useState(defaultValue ?? null);
    const handleSelection = (key) => {
      if (disabled || readOnly) return;
      const next = key == null ? null : String(key);
      if (value === undefined) setInternalSelectedKey(next);
      onChange?.(next ?? undefined);
    };
    const selectContext = { disabled, readOnly, resolvedSize, geometry, anchorRef, modal: isModal };
    const defaultChildren = React.createElement(React.Fragment, null,
      trigger ? React.createElement(Select.Trigger, { ...trigger.props, disabled: disabled || trigger.props.disabled })
        : React.createElement(Select.Trigger, null,
          React.createElement(Select.Value, null, selectedContent ?? (({ selectedText }) => selectedText || placeholder)),
          React.createElement(ChevronDownIcon, { className: 'muxui-select-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 })),
      React.createElement(Select.Popup, null, React.createElement(Select.List, { items })));
    return React.createElement(SelectContext.Provider, { value: selectContext },
      React.createElement(AriaSelect, {
        ...props, ref, selectedKey: value !== undefined ? value : internalSelectedKey,
        isOpen: disabled ? false : open, defaultOpen: !disabled && defaultOpen,
        onOpenChange: (next) => { if (!disabled || !next) onOpenChange?.(next); },
        onSelectionChange: handleSelection, isDisabled: disabled, isRequired: required,
        isInvalid: invalid || undefined, name, placeholder,
        'data-readonly': readOnly || undefined, className: classNames('muxui-select', className),
        'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
      },
      label !== undefined ? React.createElement(Select.Label, null, label) : null,
      children ?? defaultChildren,
      description !== undefined ? React.createElement(Select.Description, null, description) : null,
      errorMessage !== undefined ? React.createElement(Select.Error, null, errorMessage) : null));
  });
  Select.displayName = 'Select';

  Select.Root = Select;
  Select.Label = React.forwardRef(function SelectLabel({ children, className, ...props }, ref) {
    return React.createElement(AriaLabel, { ...props, ref, elementType: 'span', className: classNames('muxui-field-label muxui-select-label', className) }, children);
  });
  Select.Trigger = React.forwardRef(function SelectTrigger({ children, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(CollectionTrigger, { ...props, ref, disabled: effectiveDisabled, className: classNames('muxui-select-trigger', className) }, children);
  });
  Select.Value = React.forwardRef(function SelectValue({ children, className, ...props }, ref) {
    return React.createElement(AriaSelectValue, { ...props, ref, className: classNames('muxui-select-value', className) }, children);
  });
  Select.Popup = React.forwardRef(function SelectPopup({ children, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const defaults = { placement: 'bottom-start', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12, ...context.geometry };
    defaults.placement = defaults.placement.replace(' ', '-');
    const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, defaults, 'Select.Popup');
    return React.createElement(PopoverMotion, { ...props, ...geometry, ref, triggerRef: anchorRef ?? context.anchorRef, isNonModal: !normalizeBoolean(modal, context.modal ?? true, 'Select.Popup modal'), className: classNames('muxui-select-popover', className), 'data-size': context.resolvedSize }, children);
  });
  Select.List = React.forwardRef(function SelectList({ children, items = [], className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    return React.createElement(AriaListBox, { ...props, ref, items: hasChildren ? undefined : normalized, className: classNames('muxui-select-list', className), 'data-size': context.resolvedSize }, hasChildren ? children : (item) => React.createElement(Select.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
  });
  Select.Item = React.forwardRef(function SelectItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(SelectContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaListBoxItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-select-option', className) }, children);
  });
  Select.Description = React.forwardRef(function SelectDescription({ children, className, ...props }, ref) {
    return React.createElement(AriaText, { ...props, ref, elementType: 'span', slot: 'description', className: classNames('muxui-field-description muxui-select-description', className) }, children);
  });
  Select.Error = React.forwardRef(function SelectError({ children, className, ...props }, ref) {
    return React.createElement(AriaFieldError, { ...props, ref, elementType: 'span', className: classNames('muxui-field-error muxui-select-error', className) }, children);
  });
  return Select;
})();

export const RadioGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function RadioGroup({ label, options = [], children, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
    const labelId = React.useId();
    // The visible label text labels the group, so the two cannot drift apart.
    const generatedLabelledby = ariaLabel === undefined && ariaLabelledby === undefined && label !== undefined && label !== null
      ? labelId
      : undefined;
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('RadioGroup orientation must be horizontal or vertical');
    }
    if (options.length > 0 && children !== undefined && children !== null) {
      throw new TypeError('RadioGroup options and children are mutually exclusive');
    }
    const resolvedSize = normalizeChoiceControlSize(size, 'RadioGroup');
    const radioContent = options.length > 0
      ? options.map((option) => React.createElement(AriaRadio, { key: String(option.id ?? option.value), value: String(option.value ?? option.id), isDisabled: disabled || option.disabled, className: classNames('muxui-radio', resolvedSize === undefined || resolvedSize === 'md' ? undefined : `muxui-radio--${resolvedSize}`) }, (renderProps) => React.createElement(React.Fragment, null,
        React.createElement(RadioMotionIndicator, { renderProps }),
        option.label ?? option.value)))
      : children;
    const group = React.createElement(AriaRadioGroup, { ref, name, value, defaultValue, onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, orientation, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? generatedLabelledby, 'data-orientation': orientation, 'data-size': resolvedSize, className: classNames('muxui-radio-group', className) }, radioContent);
    const motionGroup = React.createElement(RadioGroupMotion, { rootRef: ref }, group);
    const content = label === undefined
      ? motionGroup
      : React.createElement('div', { className: 'muxui-radio-group-field', 'data-disabled': disabled || undefined, 'data-invalid': invalid || undefined },
        React.createElement('span', { id: generatedLabelledby, className: 'muxui-field-label' }, label),
        motionGroup);
    return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, content);
  });
  component.displayName = 'RadioGroup';
  return component;
})();

export const Slider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'Slider');
    const readOnlyRef = useReadOnlyTargets(ref, readOnly, '[role="slider"], input[type="range"]');
    const preventReadOnlyInteraction = React.useCallback((event) => {
      if (readOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, [readOnly]);
    const handleChange = React.useCallback((next) => {
      if (!disabled && !readOnly) onChange?.(next);
    }, [disabled, onChange, readOnly]);
    const handleChangeEnd = React.useCallback((next) => {
      if (!disabled && !readOnly) onChangeEnd?.(next);
    }, [disabled, onChangeEnd, readOnly]);
    const assignSliderRef = React.useCallback((node) => {
      if (node) {
        if (disabled) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      }
      readOnlyRef(node);
    }, [disabled, readOnlyRef]);
    return React.createElement(AriaSlider, {
      ...props,
      ref: assignSliderRef,
      value,
      defaultValue,
      onChange: handleChange,
      onChangeEnd: readOnly ? undefined : handleChangeEnd,
      minValue: min,
      maxValue: max,
      step,
      isDisabled: disabled,
      orientation,
      'data-readonly': readOnly || undefined,
      onMouseDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onPointerDownCapture: preventReadOnlyInteraction,
      onPointerMoveCapture: preventReadOnlyInteraction,
      onTouchMoveCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(readOnly),
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(SliderMotionTrack, { orientation, readOnly, name })));
  });
  component.displayName = 'Slider';
  return component;
})();

const AriaOutput = AriaSliderOutput;

function normalizeSortDescriptor(value, columns) {
  if (value === undefined) return undefined;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.length !== 2
    || !keys.includes('column') || !keys.includes('direction') || typeof value.column !== 'string'
    || (value.direction !== 'ascending' && value.direction !== 'descending')) {
    throw new TypeError('Table sortDescriptor must be {column: string; direction: ascending|descending}');
  }
  const column = columns.find((candidate) => candidate.id === value.column);
  if (!column || !column.sortable) throw new TypeError(`Table sortDescriptor column must be sortable: ${value.column}`);
  return { column: value.column, direction: value.direction };
}

export const Table = React.forwardRef(function Table({ columns = [], rows = [], selectedIds, defaultSelectedIds, onSelectionChange, onRowAction, sortDescriptor, onSortChange, selectionMode = 'none', disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, ...props }, ref) {
  const normalizedRows = normalizeItems(rows);
  // Cells read the consumer's row, not the normalized copy that injects id, label, and value.
  const sourceRows = new Map(normalizedRows.map((row, index) => [row.id, rows[index]]));
  const normalizedColumns = normalizeItems(columns);
  const normalizedSortDescriptor = normalizeSortDescriptor(sortDescriptor, normalizedColumns);
  accessibleName({ ariaLabel }, 'Table');
  const disabledKeys = disabled ? new Set(normalizedRows.map((row) => row.id)) : new Set(normalizedRows.filter((row) => row.disabled).map((row) => row.id));
  return React.createElement(AriaTable, { ...props, ref, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), sortDescriptor: normalizedSortDescriptor, disabledKeys, isDisabled: disabled, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onSortChange: (next) => { if (disabled || !next) return; const descriptor = normalizeSortDescriptor({ column: String(next.column), direction: next.direction }, normalizedColumns); onSortChange?.(descriptor); }, ...(onRowAction ? { onRowAction: (key) => { const row = normalizedRows.find((item) => item.id === String(key)); if (!disabled && !row?.disabled) onRowAction(row); } } : {}), 'aria-label': ariaLabel, 'aria-disabled': disabled || undefined, className: classNames('muxui-table', className) },
    React.createElement(AriaTableHeader, { columns: normalizedColumns, className: 'muxui-table-header' }, (column) => React.createElement(AriaColumn, { id: column.id, isRowHeader: column.isRowHeader, allowsSorting: column.sortable, className: 'muxui-table-column' }, column.label)),
    React.createElement(AriaTableBody, { items: normalizedRows, className: 'muxui-table-body' }, (row) => React.createElement(AriaRow, { id: row.id, className: 'muxui-table-row' }, normalizedColumns.map((column) => React.createElement(AriaCell, { key: column.id, className: 'muxui-table-cell' }, row.values?.[column.id] ?? sourceRows.get(row.id)?.[column.id] ?? '')))),
  );
});
Table.displayName = 'Table';

export const Tabs = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tabs({ items = [], value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, size, variant = 'underline', children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
    const resolvedSize = normalizeChoiceControlSize(size, 'Tabs');
    const resolvedVariant = normalizeTabsVariant(variant);
    return React.createElement(AriaTabs, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue ?? (normalized.find((item) => !item.disabled) ?? normalized[0])?.id, onSelectionChange: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); }, orientation, keyboardActivation, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tabs', className), 'data-size': resolvedSize, 'data-variant': resolvedVariant },
      React.createElement(TabsMotion, { orientation, variant: resolvedVariant, disabled }, React.createElement(AriaTabList, { items: normalized, className: 'muxui-tab-list' }, (item) => React.createElement(AriaTab, { id: item.id, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-tab' }, React.createElement('span', { className: 'muxui-tab-label' }, item.label)))),
      React.createElement(AriaTabPanels, { items: normalized, className: 'muxui-tab-panels' }, (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tab-panel' }, item.panel)),
    );
  });
  component.displayName = 'Tabs';
  return component;
})();

export const TagGroup = React.forwardRef(function TagGroup({ label, items = [], onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  return React.createElement(AriaTagGroup, { ref, ...(onRemove ? { onRemove: (keys) => { if (!disabled) onRemove([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item) => item && !item.disabled)); } } : {}), onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction?.(item); }, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tag-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTagList, { items: normalized, className: 'muxui-tag-list' }, (item) => React.createElement(AriaTag, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, className: 'muxui-tag' }, item.label, onRemove ? React.createElement(IconButton, { slot: 'remove', disabled: disabled || item.disabled, className: 'muxui-tag-remove' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null)));
});
TagGroup.displayName = 'TagGroup';

export const ToggleButtonGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function ToggleButtonGroup({ selectedIds, defaultSelectedIds, onSelectionChange, selectionMode = 'single', orientation = 'horizontal', disabled = false, disallowEmptySelection = false, size = 'md', children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ToggleButtonGroup');
    const selectedKeys = readonlyKeySet(selectedIds, 'selectedIds', selectionMode);
    const defaultSelectedKeys = readonlyKeySet(defaultSelectedIds, 'defaultSelectedIds', selectionMode);
    const resolvedSize = normalizeToggleButtonSize(size, 'ToggleButtonGroup');
    const group = React.createElement(AriaToggleButtonGroup, {
      ...props,
      selectedKeys,
      defaultSelectedKeys,
      selectionMode,
      disallowEmptySelection,
      onSelectionChange: (keys) => {
        if (!disabled) {
          if (keys === 'all') throw new TypeError('ToggleButtonGroup selection cannot be all');
          if (disallowEmptySelection && keys.size === 0) return;
          onSelectionChange?.([...keys].map(String));
        }
      },
      orientation,
      isDisabled: disabled,
      'data-size': resolvedSize,
      className: classNames('muxui-toggle-button-group', className),
    }, children);
    return React.createElement(ToggleButtonSizeContext.Provider, { value: resolvedSize },
      React.createElement(ToggleButtonGroupMotion, { selectionMode, disabled, rootRef: ref }, group));
  });
  component.displayName = 'ToggleButtonGroup';
  return component;
})();

function toTokenValue(values = [], text = '') {
  const segments = values.map((value) => ({ type: 'token', text: String(value), value: String(value) }));
  if (text) segments.push({ type: 'text', text });
  return new TokenFieldValue(segments);
}

function tokenValues(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
}

function draftText(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join('');
}

// Enter commits each trimmed text run as a token in place; blank runs are dropped.
// Duplicate tokens are kept, matching the token array contract.
function commitDraftText(fieldValue) {
  const segments = fieldValue.segments.flatMap((segment) => {
    if (segment.type !== 'text') return [segment];
    const text = segment.text.trim();
    return text ? [{ type: 'token', text, value: text }] : [];
  });
  return new TokenFieldValue(segments, { caretPosition: { index: segments.length, offset: 0 } });
}

function sameTokens(left, right) {
  return left.length === right.length && left.every((token, index) => token === String(right[index]));
}

function useTokenFieldFormReset(onReset) {
  const callbackRef = React.useRef(onReset);
  const formRef = React.useRef(null);
  const listenerRef = React.useRef(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  return React.useCallback((node) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) formRef.current.removeEventListener('reset', listenerRef.current, true);
    formRef.current = nextForm;
    listenerRef.current = null;
    if (!nextForm) return;
    const listener = (event) => {
      const resetToken = ++resetTokenRef.current;
      Promise.resolve().then(() => {
        if (resetTokenRef.current !== resetToken || formRef.current !== nextForm || listenerRef.current !== listener || event.defaultPrevented) return;
        callbackRef.current();
      });
    };
    listenerRef.current = listener;
    nextForm.addEventListener('reset', listener, true);
  }, []);
}

// The public value is the token array; typed text stays an internal draft beside
// the tokens until Enter commits it. React Aria ends IME composition whenever the
// value object changes, so the field value keeps its identity until the tokens or
// the text change.
export const TokenField = React.forwardRef(function TokenField({ label, value, defaultValue = [], onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef(null);
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = [...defaultValue];
  const initialDefaultValue = initialDefaultValueRef.current;
  const [fieldValue, setFieldValue] = React.useState(() => toTokenValue(controlled ? value : initialDefaultValue));
  const [resetVersion, setResetVersion] = React.useState(0);
  let currentFieldValue = fieldValue;
  // Controlled tokens that differ from the field (an outside change or a rejected
  // edit) replace the field tokens and keep the draft text.
  if (controlled && !sameTokens(tokenValues(fieldValue), value)) {
    currentFieldValue = toTokenValue(value, draftText(fieldValue));
    setFieldValue(currentFieldValue);
  }
  const currentValue = tokenValues(currentFieldValue);
  const inputRef = React.useRef(null);
  const showPlaceholder = Boolean(placeholder) && currentFieldValue.toString() === '';
  React.useLayoutEffect(() => {
    if (showPlaceholder) inputRef.current?.setAttribute('aria-placeholder', placeholder);
    else inputRef.current?.removeAttribute('aria-placeholder');
  }, [showPlaceholder, placeholder]);
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setFieldValue(toTokenValue(initialDefaultValue));
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next) => {
    if (disabled || readOnly) return;
    const nextValue = tokenValues(next);
    // A controlled consumer that keeps its tokens rejects the change on the next render.
    setFieldValue(next);
    if (!sameTokens(nextValue, currentValue)) onChange?.(nextValue);
  };
  // React Aria calls onSubmit for Enter (insertParagraph), never mid-composition.
  const handleSubmit = () => {
    if (disabled || readOnly || !draftText(currentFieldValue).trim()) return;
    handleChange(commitDraftText(currentFieldValue));
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: currentFieldValue, onChange: handleChange, onSubmit: handleSubmit, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTokenInput, { ref: inputRef, className: 'muxui-token-input', children: (segment) => segment.type === 'token' ? React.createElement(AriaToken, { className: 'muxui-token' }, segment.text) : null }), React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }), name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null, showPlaceholder ? React.createElement('span', { className: 'muxui-token-placeholder', 'aria-hidden': 'true' }, placeholder) : null);
});
TokenField.displayName = 'TokenField';

export const Toolbar = React.forwardRef(function Toolbar({ orientation = 'horizontal', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  return React.createElement(AriaToolbar, { ...props, ref, orientation, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';

function normalizeTreeItems(items, used = new Set(), parentDisabled = false) {
  return items.map((item, index) => {
    const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const nested = normalizeTreeItems(source.children ?? source.items ?? [], used, parentDisabled || Boolean(source.disabled));
    const label = source.label ?? source.name ?? source.value ?? id;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id), disabled: parentDisabled || Boolean(source.disabled), children: nested };
  });
}

function treeKeys(items, keys = []) {
  for (const item of items) {
    keys.push(item.id);
    treeKeys(item.children ?? [], keys);
  }
  return keys;
}

function findTreeItem(items, key) {
  for (const item of items) {
    if (item.id === String(key)) return item;
    const nested = findTreeItem(item.children ?? [], key);
    if (nested) return nested;
  }
  return undefined;
}

const TREE_EXPANSION_TRIGGERS = new Set(['chevron', 'row']);

function normalizeTreeExpansionTrigger(value = 'row') {
  if (!TREE_EXPANSION_TRIGGERS.has(value)) {
    throw new TypeError('Tree expansionTrigger must be one of: chevron, row');
  }
  return value;
}

const TREE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],[role="checkbox"],[role="combobox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';

function isTreeInteractiveTarget(target, boundary) {
  if (!(target instanceof Element)) return false;
  let current = target;
  while (current && current !== boundary) {
    if (current.matches(TREE_INTERACTIVE_SELECTOR)) return true;
    const contentEditable = current.getAttribute('contenteditable');
    if (contentEditable !== null && contentEditable !== 'false') return true;
    current = current.parentElement;
  }
  return false;
}

function treeItem(item, expansionTrigger, treeDisabled) {
  const nested = item.children ?? [];
  const rowExpansionEnabled = expansionTrigger === 'row' && !treeDisabled && !item.disabled && nested.length > 0;
  const rowExpansion = { toggleKey: undefined };
  return React.createElement(AriaTreeItem, {
    id: item.id,
    textValue: item.textValue,
    hasChildItems: nested.length > 0,
    isDisabled: item.disabled,
    className: 'muxui-tree-item',
    onClickCapture: rowExpansionEnabled ? (event) => {
      if (!event.currentTarget.contains(event.target)) return;
      if (isTreeInteractiveTarget(event.target, event.currentTarget)) return;
      rowExpansion.toggleKey?.();
    } : undefined,
  },
    React.createElement(AriaTreeItemContent, null, ({ state }) => {
      rowExpansion.toggleKey = rowExpansionEnabled ? () => state.toggleKey(item.id) : undefined;
      return React.createElement('div', { className: 'muxui-tree-item-content' },
        nested.length ? React.createElement(IconButton, { slot: 'chevron', 'aria-label': 'Toggle', disabled: item.disabled, className: 'muxui-tree-toggle' }, React.createElement(ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', strokeWidth: 0, size: 16 })) : null,
        React.createElement('span', { className: 'muxui-tree-item-label' }, item.label));
    }),
    nested.map((child) => React.cloneElement(treeItem(child, expansionTrigger, treeDisabled), { key: child.id })));
}

export const Tree = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tree({ items = [], selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, onSelectionChange, onExpandedChange, onAction, selectionMode = 'single', expansionTrigger = 'row', disabled = false, children: _children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Tree');
    const normalizedExpansionTrigger = normalizeTreeExpansionTrigger(expansionTrigger);
    const normalized = normalizeTreeItems(items);
    const allKeys = treeKeys(normalized);
    const disabledKeys = new Set(disabled ? allKeys : allKeys.filter((key) => findTreeItem(normalized, key)?.disabled));
    const expanded = expandedIds === 'all' ? new Set(allKeys) : keySet(expandedIds);
    const defaultExpanded = defaultExpandedIds === 'all' ? new Set(allKeys) : keySet(defaultExpandedIds);
    const motionControllerRef = React.useRef(null);
    const handleExpandedChange = React.useCallback((keys) => {
      motionControllerRef.current?.beforeExpandedChange();
      if (!disabled) onExpandedChange?.(keyList(keys));
    }, [disabled, onExpandedChange]);
    const tree = React.createElement(AriaTree, { ...props, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), expandedKeys: expanded, defaultExpandedKeys: defaultExpanded, disabledKeys, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onExpandedChange: handleExpandedChange, ...(onAction ? { onAction: (key) => { const item = findTreeItem(normalized, key); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, className: classNames('muxui-tree', className) }, normalized.map((item) => React.cloneElement(treeItem(item, normalizedExpansionTrigger, disabled), { key: item.id })));
    return React.createElement(TreeMotion, { rootRef: ref, controllerRef: motionControllerRef }, tree);
  });
  component.displayName = 'Tree';
  return component;
})();

function assertPositiveVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`Virtualizer ${property} must be a finite number greater than 0`);
}

function assertNonNegativeVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new TypeError(`Virtualizer ${property} must be a finite number greater than or equal to 0`);
}

// Mux owns the row-count overscan policy while RAC still owns the collection,
// focus persistence, scroll anchoring, and visible-rect lifecycle.
class MuxFixedRowListLayout extends ListLayout {
  update(invalidationContext) {
    this.overscan = invalidationContext.layoutOptions?.overscan ?? 2;
    super.update(invalidationContext);
  }

  shouldInvalidateLayoutOptions(newOptions, oldOptions) {
    return newOptions?.overscan !== oldOptions?.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  getVisibleLayoutInfos(rect) {
    const visibleRect = this.virtualizer?.visibleRect;
    const rowSize = (this.rowSize ?? this.estimatedRowSize ?? 48) + this.gap;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || rowSize <= 0) return super.getVisibleLayoutInfos(rect);
    const expandedRect = visibleRect.copy();
    const overscanSize = rowSize * (this.overscan ?? 2);
    expandedRect.y = Math.max(0, expandedRect.y - overscanSize);
    expandedRect.height += overscanSize * 2;
    const start = Math.max(0, Math.floor(visibleRect.y / rowSize) - (this.overscan ?? 2));
    const end = Math.ceil((visibleRect.y + visibleRect.height) / rowSize) + (this.overscan ?? 2);
    return super.getVisibleLayoutInfos(expandedRect).filter((layoutInfo) => {
      if (layoutInfo.type !== 'item') return true;
      const index = Math.round((layoutInfo.rect.y - this.padding) / rowSize);
      return (index >= start && index < end) || this.virtualizer.isPersistedKey(layoutInfo.key);
    });
  }
}

export const Virtualizer = React.forwardRef(function Virtualizer({ items = [], renderItem: _renderItem, itemHeight = 40, height = 240, overscan = 2, disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, style, onScroll, ...props }, ref) {
  accessibleName({ ariaLabel }, 'Virtualizer');
  assertPositiveVirtualizerNumber(itemHeight, 'itemHeight');
  assertPositiveVirtualizerNumber(height, 'height');
  assertNonNegativeVirtualizerNumber(overscan, 'overscan');
  const normalized = normalizeItems(items);
  return React.createElement(AriaVirtualizer, { layout: MuxFixedRowListLayout, layoutOptions: { rowSize: itemHeight, overscan } },
    React.createElement(AriaListBox, {
      ...props,
      ref,
      items: normalized,
      selectionMode: 'none',
      disabledKeys: disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id)),
      isDisabled: disabled,
      'aria-label': ariaLabel,
      'aria-disabled': disabled || undefined,
      className: classNames('muxui-virtualizer', className),
      style: { ...style, blockSize: height, overflow: 'auto' },
      onScroll: (event) => { if (!disabled) onScroll?.(event); },
    }, (item) => React.createElement(AriaListBoxItem, {
      id: item.id,
      textValue: item.textValue,
      className: 'muxui-virtualizer-item',
      isDisabled: disabled || item.disabled,
    }, item.label ?? item.value ?? item.id)));
});
Virtualizer.displayName = 'Virtualizer';
