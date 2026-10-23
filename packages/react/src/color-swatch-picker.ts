import React from 'react';
import type { ForwardRefExoticComponent, RefAttributes, SyntheticEvent } from 'react';
import {
  ColorSwatch as AriaColorSwatch,
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
  parseColor,
} from 'react-aria-components';
import type { Color } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';
import type { MuxUIItems, NormalizedItem } from './collection-items.ts';
import { READ_ONLY_SELECTION_KEYS, readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';
import type { MuxUIColorValue } from './color-context.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

// The accessible name's arms (aria-label and aria-labelledby) and className stay in the public type and are
// not Mux UI-owned members. The own props are a type literal, not an interface, so the public props type
// stays assignable to Record<string, unknown>, as it was before the move.

/** The props Mux UI defines for ColorSwatchPicker. It takes no `name` and does not submit with a form; use a named ColorField to submit a color. */
export type ColorSwatchPickerOwnProps = {
  /** The swatches as data: color strings, or items whose `color` or `value` is a valid CSS color string. Each item needs a distinct color, because options are keyed by color, and duplicate colors throw a TypeError. An item's `label` or `textValue` names its swatch; otherwise the swatch uses its color name. */
  items?: MuxUIItems;
  /** The selected color, when the caller controls it. `null` is controlled and empty; `undefined` leaves the value uncontrolled. */
  value?: MuxUIColorValue | null;
  /** The color selected at first, when the picker controls itself. */
  defaultValue?: MuxUIColorValue;
  /** Disables the picker and every swatch. A disabled enclosing ColorPicker disables it too. */
  disabled?: boolean;
  /** Makes the picker read-only: arrow keys still move focus between swatches, but presses, Space, and Enter do not select one. A read-only enclosing ColorPicker does the same. */
  readOnly?: boolean;
  /** Called with the selected swatch's color as a CSS string in that swatch's color space: rgba(r, g, b, a) for a hex or RGB swatch, and hsla(h, s%, l%, a) for an HSL or HSB swatch. A disabled or read-only picker does not call it. */
  onChange?: (value: MuxUIColorValue) => void;
};

export type ColorSwatchPickerProps = ColorSwatchPickerOwnProps & { className?: string } & MuxUIAriaAccessibleName;

/** An item whose color is parsed, with the name its swatch takes when the item names it. */
interface SwatchItem extends NormalizedItem {
  color: Color | undefined;
  colorName: string | undefined;
}

// React Aria keys swatch options by colour, so each item needs a distinct colour.
// An explicit item label or textValue becomes the swatch colour name.
// normalizeItems takes no items as an empty list, so an omitted list has no default of the component's to state.
function colorSwatchItems(items: MuxUIItems = []): SwatchItem[] {
  const seen = new Set<string | undefined>();
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
function unusedSwatchColor(items: SwatchItem[]): Color {
  const used = new Set(items.map((item) => item.color?.toString('hexa')));
  for (let alpha = 0; alpha < 256; alpha += 1) {
    const color = parseColor(`#000000${alpha.toString(16).padStart(2, '0')}`);
    if (!used.has(color.toString('hexa'))) return color;
  }
  throw new TypeError('ColorSwatchPicker cannot represent an empty value for these items');
}

export const ColorSwatchPicker: ForwardRefExoticComponent<ColorSwatchPickerProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ColorSwatchPickerProps>(function ColorSwatchPicker({ items, value, defaultValue, onChange, disabled = false, readOnly = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = colorSwatchItems(items);
  const pickerState = React.useContext(ColorPickerContext);
  // Conditionals, not ||: extraction reads a fallback on an owned prop as an executed default.
  const effectiveDisabled = disabled ? disabled : pickerState.disabled;
  const effectiveReadOnly = readOnly ? readOnly : pickerState.readOnly;
  accessibleName({ ariaLabel, ariaLabelledby }, 'ColorSwatchPicker');
  const preventReadOnlyInteraction = (event: SyntheticEvent) => {
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
      // The styles read these data attributes, which React's props do not name, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined },
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
        onChange: (next: Color) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
        // React Aria's props name neither isDisabled nor the data-readonly hook the styles read.
        ...{ isDisabled: effectiveDisabled, 'data-readonly': effectiveReadOnly || undefined },
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledby,
        className: classNames('muxui-color-swatch-picker', className),
      },
      normalized.map((item) => React.createElement(
        AriaColorSwatchPickerItem,
        {
          key: item.id,
          // An empty colour string parses to no colour. React Aria's item type requires one, and it is handed over as before.
          color: item.color!,
          // React Aria's item props name none of these, and TypeScript accepts such a key in a call only from a spread.
          ...{ id: item.id, isDisabled: effectiveDisabled || item.disabled, 'data-readonly': effectiveReadOnly || undefined },
          className: 'muxui-color-swatch-picker-item',
        },
        React.createElement(AriaColorSwatch, {
          color: item.color,
          colorName: item.colorName,
          ...{
            isDisabled: effectiveDisabled || item.disabled,
            'data-disabled': effectiveDisabled || item.disabled || undefined,
            'data-muxui-color-paint': 'sample',
          },
          className: 'muxui-color-swatch',
        }),
      )),
    ),
  );
});
ColorSwatchPicker.displayName = 'ColorSwatchPicker';
