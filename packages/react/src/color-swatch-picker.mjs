import React from 'react';
import {
  ColorSwatch as AriaColorSwatch,
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
  parseColor,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.mjs';
import { READ_ONLY_SELECTION_KEYS, readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';

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
