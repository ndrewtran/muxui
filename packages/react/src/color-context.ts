import React from 'react';
import type { Context } from 'react';
import { parseColor } from 'react-aria-components';
import type { Color } from 'react-aria-components';

/** A CSS color string. A color control's onChange returns one in the color space of its value, of an enclosing ColorPicker's color, or of its defaultValue: rgba(r, g, b, a) for hex and rgb, hsla(h, s%, l%, a) for hsl and hsb. ColorSlider with colorSpace uses that space, and ColorSwatchPicker returns the chosen item's color. */
export type MuxUIColorValue = string;
export type MuxUIColorSpace = 'rgb' | 'hsl' | 'hsb';
/** Channels must belong to colorSpace, or, when colorSpace is omitted, to the space of an enclosing ColorPicker's color, otherwise value or defaultValue. */
export type MuxUIColorChannel = 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'lightness' | 'brightness' | 'alpha';

/**
 * @internal
 * Parses a Mux UI color string into React Aria's color; an empty value is none. The value is `unknown`
 * because it is checked here, whether a typed prop or an item field of unknown type.
 */
export function colorValue(value: unknown, name: string): Color | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new TypeError(`${name} values must be Mux UI color strings`);
  try { return parseColor(value); } catch { throw new TypeError(`${name} values must be valid CSS color strings`); }
}

interface ColorPickerState {
  disabled: boolean;
  readOnly: boolean;
  /** The color space the enclosing picker keeps its color in. Absent outside a picker. */
  space?: MuxUIColorSpace;
}

// RAC's ColorPicker does not propagate disabled/read-only state through
// arbitrary child layout, so MuxUI owns that propagation separately. A
// context keeps fragments and wrapper elements transparent to the contract.
export const ColorPickerContext: Context<ColorPickerState> = React.createContext<ColorPickerState>({ disabled: false, readOnly: false });

// Whether two colors of one space have exactly the same channels and alpha. React Aria's Color
// names no alpha property, but its channel reader returns it for every color class.
function sameColor(a: Color, b: Color) {
  return a.getColorSpace() === b.getColorSpace() && a.getChannelValue('alpha') === b.getChannelValue('alpha') && a.getColorChannels().every((channel) => a.getChannelValue(channel) === b.getChannelValue(channel));
}

// Whether `edit`, the color of a control's last edit, still describes `color`: the same channels once converted
// to the color's space, alpha aside. Hue wraps, so 0 and 360 match. RGB channels are whole numbers on both sides
// and match exactly; only hsl and hsb percentages need a tolerance, for the two decimals a CSS string keeps.
function editDescribesColor(edit: Color, color: Color) {
  const space = color.getColorSpace();
  const converted = edit.toFormat(space);
  return color.getColorChannels().every((channel) => {
    const gap = Math.abs(converted.getChannelValue(channel) - color.getChannelValue(channel));
    if (channel === 'hue') return gap % 360 === 0;
    return gap <= (space === 'rgb' ? 0 : 0.01);
  });
}

interface RememberedEdit {
  color: Color;
  /** The driven color the edit started from. */
  received: Color;
}

/**
 * @internal
 * Hex and rgb cannot hold the hue of black, white, and grays, and hsl cannot hold the saturation of black, so a
 * ColorPicker, or a control driven by a value, remembers the color of its last edit, with the value that edit
 * started from. The memory shows while the value describes it. A value equal to the one the edit started from may
 * only be waiting to accept the edit, so only a new value decides: one that still describes the edit adopts it, any
 * other forgets it. An edit the memory already describes, such as an alpha change a child reports in the value's
 * space, keeps the richer memory. Returns the color to show, and a function that remembers an edit.
 */
export function useRememberedEdit(driven: Color | undefined): [Color | undefined, (color: Color) => void] {
  const [edit, setEdit] = React.useState<RememberedEdit | null>(null);
  const describes = edit && driven && editDescribesColor(edit.color, driven);
  if (edit && driven && !sameColor(driven, edit.received)) setEdit(describes ? { ...edit, received: driven } : null);
  return [
    describes ? edit.color.withChannelValue('alpha', driven.getChannelValue('alpha')) : driven,
    (color) => { if (driven && !(describes && editDescribesColor(edit.color, color))) setEdit({ color, received: driven }); },
  ];
}
