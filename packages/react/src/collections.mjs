import React from 'react';
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
  ColorSlider as AriaColorSlider,
  ColorSwatch as AriaColorSwatch,
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
  ColorWheel as AriaColorWheel,
  ColorWheelTrack as AriaColorWheelTrack,
  ColorThumb as AriaColorThumb,
  ComboBox as AriaComboBox,
  ComboBoxValue as AriaComboBoxValue,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  RangeCalendar as AriaRangeCalendar,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
  Slider as AriaSlider,
  SliderFill as AriaSliderFill,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
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
  Popover as AriaPopover,
  parseColor,
  TokenFieldValue,
} from 'react-aria-components';
import { parseDate } from '@internationalized/date';

function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
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

function setReadOnlyTargetGuard(target, readOnly) {
  const existingGuard = readOnlyTargetGuards.get(target);
  if (readOnly && !existingGuard) {
    const guard = (event) => {
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

function calendarGrid(cellClass = 'muxui-calendar-cell') {
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

function calendarProps(props, name, labelId) {
  const { value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, isDateUnavailable: _upstreamDateUnavailable, onChange, onFocusChange, disabled, readOnly, required, invalid, label, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className, ...rest } = props;
  accessibleName({ label, ariaLabel, ariaLabelledby }, name);
  return {
    ...rest,
    value: dateValue(value, name),
    defaultValue: dateValue(defaultValue, name),
    focusedValue: dateValue(focusedValue, name),
    minValue: dateValue(minValue, name),
    maxValue: dateValue(maxValue, name),
    isDateUnavailable: dateUnavailableCallback(unavailableDateMatcher, name),
    isDisabled: disabled,
    isReadOnly: readOnly,
    isRequired: required,
    isInvalid: invalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby ?? (label !== undefined ? labelId : undefined),
    className: classNames(`muxui-${name.toLowerCase()}`, className),
    onChange: (next) => { if (!disabled && !readOnly) onChange?.(serializeDateValue(next)); },
    onFocusChange: (next) => { if (!disabled) onFocusChange?.(serializeDateValue(next)); },
  };
}

export const Calendar = React.forwardRef(function Calendar(props, ref) {
  const { label, description: _description, errorMessage: _errorMessage, ...rest } = props;
  const labelId = React.useId();
  return React.createElement(AriaCalendar, { ...calendarProps({ ...rest, label }, 'Calendar', labelId), ref },
    label !== undefined ? React.createElement(AriaLabel, { id: labelId, className: 'muxui-field-label' }, label) : null,
    calendarHeader(),
    calendarGrid());
});
Calendar.displayName = 'Calendar';

export const RangeCalendar = React.forwardRef(function RangeCalendar(props, ref) {
  const { label, description: _description, errorMessage: _errorMessage, value, defaultValue, focusedValue, minValue, maxValue, unavailableDateMatcher, isDateUnavailable: _upstreamDateUnavailable, onChange, onFocusChange,
    disabled = false, readOnly = false, required = false, invalid = false, className,
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...rest } = props;
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'RangeCalendar');
  const labelId = React.useId();
  const mapRange = (range) => range ? { start: dateValue(range.start, 'RangeCalendar'), end: dateValue(range.end, 'RangeCalendar') } : undefined;
  return React.createElement(AriaRangeCalendar, {
    ...rest,
    ref,
    value: mapRange(value),
    defaultValue: mapRange(defaultValue),
    focusedValue: dateValue(focusedValue, 'RangeCalendar'),
    minValue: dateValue(minValue, 'RangeCalendar'),
    maxValue: dateValue(maxValue, 'RangeCalendar'),
    isDateUnavailable: dateUnavailableCallback(unavailableDateMatcher, 'RangeCalendar'),
    isDisabled: disabled,
    isReadOnly: readOnly,
    isRequired: required,
    isInvalid: invalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby ?? (label !== undefined ? labelId : undefined),
    className: classNames('muxui-range-calendar', className),
    onChange: (next) => { if (!disabled && !readOnly) onChange?.(next ? { start: serializeDateValue(next.start), end: serializeDateValue(next.end) } : undefined); },
    onFocusChange: (next) => { if (!disabled) onFocusChange?.(serializeDateValue(next)); },
  },
  label !== undefined ? React.createElement(AriaLabel, { id: labelId, className: 'muxui-field-label' }, label) : null,
  calendarHeader(),
  calendarGrid('muxui-range-calendar-cell'));
});
RangeCalendar.displayName = 'RangeCalendar';

export const ColorSwatch = React.forwardRef(function ColorSwatch({ color, disabled = false, className, ...props }, ref) {
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  return React.createElement(AriaColorSwatch, { ...props, ref, color: colorValue(color, 'ColorSwatch'), isDisabled: effectiveDisabled, 'aria-disabled': effectiveDisabled || undefined, 'data-disabled': effectiveDisabled || undefined, 'data-readonly': pickerState.readOnly || undefined, className: classNames('muxui-color-swatch', className) });
});
ColorSwatch.displayName = 'ColorSwatch';

export const ColorField = React.forwardRef(function ColorField({ label, description, errorMessage, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorField');
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  return React.createElement(AriaColorField, {
    ...props, ref, name, value: colorValue(value, 'ColorField'), defaultValue: colorValue(defaultValue, 'ColorField'),
    onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next?.toString()); }, isDisabled: effectiveDisabled, isReadOnly: effectiveReadOnly, isRequired: required,
    isInvalid: invalid || errorMessage !== undefined, className: classNames('muxui-color-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
  }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
  React.createElement(AriaInput, { className: 'muxui-field-input' }),
  description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
  errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null);
});
ColorField.displayName = 'ColorField';

export const ColorArea = React.forwardRef(function ColorArea({ label, value, defaultValue, onChange, disabled = false, readOnly = false, invalid: _invalid, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
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
      ...props,
      ref: assignAreaRef,
      value: colorValue(value, 'ColorArea'),
      defaultValue: colorValue(defaultValue, 'ColorArea'),
      onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
      isDisabled: effectiveDisabled,
      'aria-label': ariaLabel,
      'aria-labelledby': labelledby,
      'data-readonly': effectiveReadOnly || undefined,
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-color-area', className),
    }, React.createElement(AriaColorThumb, {
      className: 'muxui-color-area-thumb',
      'data-readonly': effectiveReadOnly || undefined,
    })),
  );
});
ColorArea.displayName = 'ColorArea';

export const ColorSlider = React.forwardRef(function ColorSlider({ label, value, defaultValue, onChange, channel = 'red', colorSpace, disabled = false, readOnly = false, orientation = 'horizontal', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorSlider');
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
  return React.createElement('div', { 'aria-disabled': effectiveDisabled || undefined, 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, onPointerDownCapture: preventReadOnlyInteraction, onMouseDownCapture: preventReadOnlyInteraction, onKeyDownCapture: preventReadOnlyInteraction, onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
    React.createElement(AriaColorSlider, {
      ...props,
      ref: assignSliderRef,
      channel,
      colorSpace,
      value: colorValue(value, 'ColorSlider'),
      defaultValue: colorValue(defaultValue, 'ColorSlider'),
      onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
      isDisabled: effectiveDisabled,
      orientation,
      'data-readonly': effectiveReadOnly || undefined,
      className: classNames('muxui-color-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    },
    label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
    React.createElement(AriaSliderTrack, { className: 'muxui-color-slider-track' },
      React.createElement(AriaSliderFill, { className: 'muxui-color-slider-fill' }),
      React.createElement(AriaColorThumb, { className: 'muxui-color-slider-thumb', 'data-readonly': effectiveReadOnly || undefined }))),
  );
});
ColorSlider.displayName = 'ColorSlider';

function assertColorWheelGeometry(outerRadius, innerRadius) {
  if (typeof outerRadius !== 'number' || !Number.isFinite(outerRadius) || outerRadius < 0) throw new TypeError('ColorWheel outerRadius must be a finite nonnegative number');
  if (typeof innerRadius !== 'number' || !Number.isFinite(innerRadius) || innerRadius < 0) throw new TypeError('ColorWheel innerRadius must be a finite nonnegative number');
  if (innerRadius >= outerRadius) throw new TypeError('ColorWheel innerRadius must be less than outerRadius');
}

export const ColorWheel = React.forwardRef(function ColorWheel({ value, defaultValue, onChange, disabled = false, readOnly = false, className, outerRadius = 96, innerRadius = 64, label: _label, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ ariaLabel, ariaLabelledby }, 'ColorWheel');
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
  return React.createElement('div', { 'aria-disabled': effectiveDisabled || undefined, 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, onPointerDownCapture: preventReadOnlyInteraction, onMouseDownCapture: preventReadOnlyInteraction, onKeyDownCapture: preventReadOnlyInteraction, onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
    React.createElement(AriaColorWheel, {
      ...props,
      ref: assignWheelRef,
      outerRadius,
      innerRadius,
      value: colorValue(value, 'ColorWheel'),
      defaultValue: colorValue(defaultValue, 'ColorWheel'),
      onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
      isDisabled: effectiveDisabled,
      'data-readonly': effectiveReadOnly || undefined,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      className: classNames('muxui-color-wheel', className),
    },
    React.createElement(AriaColorWheelTrack, { className: 'muxui-color-wheel-track' }),
    React.createElement(AriaColorThumb, { className: 'muxui-color-wheel-thumb', 'data-readonly': effectiveReadOnly || undefined })),
  );
});
ColorWheel.displayName = 'ColorWheel';

export const ColorPicker = React.forwardRef(function ColorPicker({ value, defaultValue, onChange, disabled = false, readOnly = false, children, className, ...props }, ref) {
  return React.createElement('div', { ...props, ref, 'aria-disabled': disabled || undefined, 'data-disabled': disabled || undefined, 'data-readonly': readOnly || undefined, className: classNames('muxui-color-picker', className) }, React.createElement(AriaColorPicker, { value: colorValue(value, 'ColorPicker'), defaultValue: colorValue(defaultValue, 'ColorPicker'), onChange: (next) => { if (!disabled && !readOnly) onChange?.(next.toString()); } }, React.createElement(ColorPickerContext.Provider, { value: { disabled, readOnly } }, children)));
});
ColorPicker.displayName = 'ColorPicker';

export const ColorSwatchPicker = React.forwardRef(function ColorSwatchPicker({ items = [], value, defaultValue, onChange, disabled = false, readOnly = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  const normalized = normalizeItems(items);
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
      onKeyDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
    },
    React.createElement(
      AriaColorSwatchPicker,
      {
        ...props,
        ref: assignSwatchPickerRef,
        value: colorValue(value, 'ColorSwatchPicker'),
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
          color: colorValue(item.color ?? item.value, 'ColorSwatchPicker'),
          id: item.id,
          isDisabled: effectiveDisabled || item.disabled,
          'data-readonly': effectiveReadOnly || undefined,
          className: 'muxui-color-swatch-picker-item',
        },
        React.createElement(AriaColorSwatch, {
          color: colorValue(item.color ?? item.value, 'ColorSwatchPicker'),
          isDisabled: effectiveDisabled || item.disabled,
          'aria-disabled': effectiveDisabled || item.disabled || undefined,
          'data-disabled': effectiveDisabled || item.disabled || undefined,
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

export const ListBox = React.forwardRef(function ListBox(props, ref) {
  const { normalized, rest, selectedKeys, defaultSelectedKeys, onSelectionChange, onAction, selectionMode, className, disabled, disabledKeys } = collectionProps(props, 'list-box');
  return React.createElement(AriaListBox, { ...rest, ref, items: normalized, selectionMode, selectedKeys, defaultSelectedKeys, disabledKeys, onSelectionChange, onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction?.(item); }, isDisabled: disabled, 'aria-disabled': disabled || undefined, className }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-list-box-item' }, item.label));
});
ListBox.displayName = 'ListBox';

export const GridList = React.forwardRef(function GridList(props, ref) {
  const { normalized, rest, selectedKeys, defaultSelectedKeys, onSelectionChange, onAction, selectionMode, className, disabled, disabledKeys } = collectionProps(props, 'grid-list');
  return React.createElement(AriaGridList, { ...rest, ref, items: normalized, selectionMode, selectedKeys, defaultSelectedKeys, disabledKeys, onSelectionChange, onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction?.(item); }, isDisabled: disabled, 'aria-disabled': disabled || undefined, className }, (item) => React.createElement(AriaGridListItem, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-grid-list-item' }, item.label));
});
GridList.displayName = 'GridList';

export const Menu = React.forwardRef(function Menu({ items = [], onAction, onSelect, disabled = false, shouldCloseOnSelect = true, children: _children, className, ...props }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Menu');
  const disabledKeys = disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
  return React.createElement(AriaMenu, { ...props, ref, items: normalized, disabledKeys, isDisabled: disabled, shouldCloseOnSelect, onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) { onAction?.(item); onSelect?.(item); } }, 'aria-disabled': disabled || undefined, className: classNames('muxui-menu', className) }, (item) => React.createElement(AriaMenuItem, { id: item.id, textValue: item.textValue, isDisabled: item.disabled || disabled, className: 'muxui-menu-item' }, item.label));
});
Menu.displayName = 'Menu';

export const ComboBox = React.forwardRef(function ComboBox({ label, description, errorMessage, items = [], value, defaultValue, selectedId, defaultSelectedId, onChange, onSelect, disabled = false, readOnly = false, required = false, invalid = false, placeholder, name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ComboBox');
  const normalized = normalizeItems(items);
  const handleSelection = (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (item && !disabled && !readOnly) onSelect?.(item); };
  return React.createElement(AriaComboBox, { ...props, ref, items: normalized, ...(value === undefined ? {} : { inputValue: value }), defaultInputValue: defaultValue, selectedKey: selectedId, defaultSelectedKey: defaultSelectedId, onInputChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || errorMessage !== undefined, name, className: classNames('muxui-combo-box', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
    label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
    React.createElement(AriaGroup, { className: 'muxui-combo-control' },
      React.createElement(AriaInput, { className: 'muxui-field-input', placeholder }),
      React.createElement(AriaButton, { className: 'muxui-combo-box-trigger', 'aria-label': 'Show options' },
        React.createElement(ChevronDownIcon, { className: 'muxui-combo-box-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 }))),
    description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
    errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
    React.createElement(AriaPopover, { className: 'muxui-combo-box-popover' }, React.createElement(AriaListBox, { items: normalized, className: 'muxui-combo-box-list' }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, className: 'muxui-combo-box-option' }, item.label))),
  );
});
ComboBox.displayName = 'ComboBox';

export const Select = React.forwardRef(function Select({ label, description, errorMessage, items = [], value, defaultValue, open, defaultOpen = false, onOpenChange, onChange, disabled = false, readOnly = false, required = false, invalid = false, placeholder = 'Select an option', name, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'Select');
  const normalized = normalizeItems(items);
  const handleSelection = (key) => { if (!disabled && !readOnly) onChange?.(key == null ? undefined : String(key)); };
  return React.createElement(AriaSelect, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue, isOpen: open, defaultOpen, onOpenChange, onSelectionChange: handleSelection, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || errorMessage !== undefined, name, className: classNames('muxui-select', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby },
    label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
    React.createElement(AriaButton, { className: 'muxui-select-trigger', 'data-disabled': disabled || undefined, 'aria-disabled': disabled || undefined }, React.createElement(AriaSelectValue, { className: 'muxui-select-value', children: ({ selectedText }) => selectedText || placeholder }), React.createElement(ChevronDownIcon, { className: 'muxui-select-arrow', 'aria-hidden': 'true', focusable: 'false', size: 16 })),
    description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
    errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null,
    React.createElement(AriaPopover, { className: 'muxui-select-popover' }, React.createElement(AriaListBox, { items: normalized, className: 'muxui-select-list' }, (item) => React.createElement(AriaListBoxItem, { id: item.id, textValue: item.textValue, className: 'muxui-select-option' }, item.label))),
  );
});
Select.displayName = 'Select';

export const RadioGroup = React.forwardRef(function RadioGroup({ label, options = [], value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
  return React.createElement(AriaRadioGroup, { ref, value, defaultValue, onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid, orientation, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-radio-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, options.map((option) => React.createElement(AriaRadio, { key: String(option.id ?? option.value), value: String(option.value ?? option.id), isDisabled: disabled || option.disabled, className: 'muxui-radio' }, React.createElement('span', { 'aria-hidden': 'true', className: 'muxui-radio-indicator' }), option.label ?? option.value)));
});
RadioGroup.displayName = 'RadioGroup';

export const Slider = React.forwardRef(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
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
    onKeyDownCapture: preventReadOnlyInteraction,
    onChangeCapture: preventReadOnlyInteraction,
    className: classNames('muxui-slider', className),
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(AriaSliderTrack, { className: 'muxui-slider-track' }, React.createElement(AriaSliderFill, { className: 'muxui-slider-fill' }), React.createElement(AriaSliderThumb, { className: 'muxui-slider-thumb', 'data-readonly': readOnly || undefined }))));
});
Slider.displayName = 'Slider';

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
  const normalizedColumns = normalizeItems(columns);
  const normalizedSortDescriptor = normalizeSortDescriptor(sortDescriptor, normalizedColumns);
  accessibleName({ ariaLabel }, 'Table');
  const disabledKeys = disabled ? new Set(normalizedRows.map((row) => row.id)) : new Set(normalizedRows.filter((row) => row.disabled).map((row) => row.id));
  return React.createElement(AriaTable, { ...props, ref, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), sortDescriptor: normalizedSortDescriptor, disabledKeys, isDisabled: disabled, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onSortChange: (next) => { if (disabled || !next) return; const descriptor = normalizeSortDescriptor({ column: String(next.column), direction: next.direction }, normalizedColumns); onSortChange?.(descriptor); }, onRowAction: (key) => { const row = normalizedRows.find((item) => item.id === String(key)); if (!disabled && !row?.disabled) onRowAction?.(row); }, 'aria-label': ariaLabel, 'aria-disabled': disabled || undefined, className: classNames('muxui-table', className) },
    React.createElement(AriaTableHeader, { columns: normalizedColumns, className: 'muxui-table-header' }, (column) => React.createElement(AriaColumn, { id: column.id, isRowHeader: column.isRowHeader, allowsSorting: column.sortable, className: 'muxui-table-column' }, column.label)),
    React.createElement(AriaTableBody, { items: normalizedRows, className: 'muxui-table-body' }, (row) => React.createElement(AriaRow, { id: row.id, className: 'muxui-table-row' }, normalizedColumns.map((column) => React.createElement(AriaCell, { key: column.id, className: 'muxui-table-cell' }, row[column.id] ?? row.values?.[column.id] ?? '')))),
  );
});
Table.displayName = 'Table';

export const Tabs = React.forwardRef(function Tabs({ items = [], value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
  return React.createElement(AriaTabs, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue ?? normalized[0]?.id, onSelectionChange: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); }, orientation, keyboardActivation, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tabs', className) },
    React.createElement(AriaTabList, { items: normalized, className: 'muxui-tab-list' }, (item) => React.createElement(AriaTab, { id: item.id, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-tab' }, item.label)),
    React.createElement(AriaTabPanels, { items: normalized, className: 'muxui-tab-panels' }, (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tab-panel' }, item.panel)),
  );
});
Tabs.displayName = 'Tabs';

export const TagGroup = React.forwardRef(function TagGroup({ label, items = [], onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  return React.createElement(AriaTagGroup, { ref, onRemove: (keys) => { if (!disabled) onRemove?.([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item) => item && !item.disabled)); }, onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction?.(item); }, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tag-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTagList, { items: normalized, className: 'muxui-tag-list' }, (item) => React.createElement(AriaTag, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, className: 'muxui-tag' }, item.label, onRemove ? React.createElement(AriaButton, { slot: 'remove', isDisabled: disabled || item.disabled, className: 'muxui-tag-remove' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null)));
});
TagGroup.displayName = 'TagGroup';

export const ToggleButtonGroup = React.forwardRef(function ToggleButtonGroup({ selectedIds, defaultSelectedIds, onSelectionChange, selectionMode = 'single', orientation = 'horizontal', disabled = false, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ToggleButtonGroup');
  const selectedKeys = readonlyKeySet(selectedIds, 'selectedIds', selectionMode);
  const defaultSelectedKeys = readonlyKeySet(defaultSelectedIds, 'defaultSelectedIds', selectionMode);
  return React.createElement(AriaToggleButtonGroup, { ...props, ref, selectedKeys, defaultSelectedKeys, selectionMode, onSelectionChange: (keys) => { if (!disabled) { if (keys === 'all') throw new TypeError('ToggleButtonGroup selection cannot be all'); onSelectionChange?.([...keys].map(String)); } }, orientation, isDisabled: disabled, className: classNames('muxui-toggle-button-group', className) }, children);
});
ToggleButtonGroup.displayName = 'ToggleButtonGroup';

function toTokenValue(values = []) {
  return new TokenFieldValue(values.map((value) => ({ type: 'token', text: String(value), value: String(value) })));
}

function tokenValues(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
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

export const TokenField = React.forwardRef(function TokenField({ label, value, defaultValue = [], onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef(null);
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = [...defaultValue];
  const initialDefaultValue = initialDefaultValueRef.current;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() => [...initialDefaultValue]);
  const [resetVersion, setResetVersion] = React.useState(0);
  const currentValue = controlled ? value : uncontrolledValue;
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setUncontrolledValue([...initialDefaultValue]);
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next) => {
    if (disabled || readOnly) return;
    const nextValue = tokenValues(next);
    if (!controlled) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: toTokenValue(currentValue), onChange: handleChange, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTokenInput, { className: 'muxui-token-input', children: (segment) => segment.type === 'token' ? React.createElement(AriaToken, { className: 'muxui-token' }, segment.text) : null }), React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }), name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null, placeholder ? React.createElement('span', { className: 'muxui-token-placeholder' }, placeholder) : null);
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

function treeItem(item) {
  const nested = item.children ?? [];
  return React.createElement(AriaTreeItem, { id: item.id, textValue: item.textValue, hasChildItems: nested.length > 0, isDisabled: item.disabled, className: 'muxui-tree-item' },
    React.createElement(AriaTreeItemContent, null,
      React.createElement('div', { className: 'muxui-tree-item-content' },
        nested.length ? React.createElement(AriaButton, { slot: 'chevron', 'aria-label': 'Toggle', isDisabled: item.disabled, className: 'muxui-tree-toggle' }, React.createElement(ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', strokeWidth: 0, size: 16 })) : null,
        React.createElement('span', { className: 'muxui-tree-item-label' }, item.label)),
    ),
    nested.map((child) => React.cloneElement(treeItem(child), { key: child.id })));
}

export const Tree = React.forwardRef(function Tree({ items = [], selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, onSelectionChange, onExpandedChange, onAction, selectionMode = 'single', disabled = false, children: _children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Tree');
  const normalized = normalizeTreeItems(items);
  const allKeys = treeKeys(normalized);
  const disabledKeys = new Set(disabled ? allKeys : allKeys.filter((key) => findTreeItem(normalized, key)?.disabled));
  const expanded = expandedIds === 'all' ? new Set(allKeys) : keySet(expandedIds);
  const defaultExpanded = defaultExpandedIds === 'all' ? new Set(allKeys) : keySet(defaultExpandedIds);
  return React.createElement(AriaTree, { ...props, ref, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), expandedKeys: expanded, defaultExpandedKeys: defaultExpanded, disabledKeys, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onExpandedChange: (keys) => { if (!disabled) onExpandedChange?.(keyList(keys)); }, onAction: (key) => { const item = findTreeItem(normalized, key); if (!disabled && !item?.disabled) onAction?.(item); }, isDisabled: disabled, className: classNames('muxui-tree', className) }, normalized.map((item) => React.cloneElement(treeItem(item), { key: item.id })));
});
Tree.displayName = 'Tree';

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
