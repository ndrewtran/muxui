import React from 'react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { ToggleButton } from '../components.ts';
import { ToggleButtonGroup } from '../toggle-button-group.ts';
import { useColorMode } from './color-mode.ts';
import type { ColorModeChoice } from './color-mode.ts';
import { cx, h } from './part-utils.ts';

export type { ColorModeChoice };

/**
 * The props Mux UI defines for ColorModePicker; the catalog's web.react API is derived from this type (Decision 0031).
 * The picker is named by aria-label or aria-labelledby, and by Color mode when it has neither.
 */
type ColorModePickerOwnProps = {
  /** The color mode, when the page controls it. System follows the operating system's preference. */
  mode?: ColorModeChoice;
  /** The mode the picker starts in, before a saved mode is read. Without one it starts on System. */
  defaultMode?: ColorModeChoice;
  /** The localStorage key a light or dark choice is saved under, and System removes. */
  storageKey?: string;
  /** Disables the picker and every option in it. */
  disabled?: boolean;
  /** Called with the new mode when the user changes it. */
  onModeChange?: (mode: ColorModeChoice) => void;
};

export type ColorModePickerProps = ColorModePickerOwnProps & { className?: string; 'aria-label'?: string; 'aria-labelledby'?: string };

const OPTIONS: readonly { id: ColorModeChoice; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export const ColorModePicker: ForwardRefExoticComponent<ColorModePickerProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, ColorModePickerProps>(function ColorModePicker({
  mode,
  defaultMode,
  storageKey = 'muxui-color-mode',
  disabled = false,
  onModeChange,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}, ref) {
  const { choice, select } = useColorMode({ mode, defaultMode, storageKey, followSystem: true });
  const name = ariaLabelledby === undefined ? { 'aria-label': ariaLabel ?? 'Color mode' } : { 'aria-labelledby': ariaLabelledby };
  return h(ToggleButtonGroup, {
    ...name,
    ref,
    selectionMode: 'single',
    disallowEmptySelection: true,
    selectedIds: [choice],
    disabled,
    className: cx('muxui-color-mode-picker', className),
    onSelectionChange: ([id]) => {
      const next = OPTIONS.find((option) => option.id === id);
      if (!next) return;
      select(next.id);
      onModeChange?.(next.id);
    },
  }, OPTIONS.map(({ id, label }) => h(ToggleButton, { key: id, id }, label)));
});
