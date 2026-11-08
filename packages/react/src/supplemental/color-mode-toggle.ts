import React from 'react';
import type { ForwardRefExoticComponent, LabelHTMLAttributes, RefAttributes } from 'react';
import { AriaSwitch } from '../substrate.ts';
import type { SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { useColorMode } from './color-mode.ts';
import type { ColorMode } from './color-mode.ts';
import { h, cx } from './part-utils.ts';

export type { ColorMode };

/**
 * The props Mux UI defines for ColorModeToggle; the catalog's web.react API is derived from
 * this type (Decision 0031). The label is its children, and its accessible name is aria-label.
 */
type ColorModeToggleOwnProps = {
  /** The color mode, when the page controls it. */
  mode?: ColorMode;
  /** The mode the toggle starts in, before a saved mode or the operating system's preference is read. */
  defaultMode?: ColorMode;
  /** The localStorage key the chosen mode is saved under. */
  storageKey?: string;
  /** Marks the toggle disabled. */
  disabled?: boolean;
  /** Called with the new mode when the toggle changes it. */
  onModeChange?: (mode: ColorMode) => void;
};

export type ColorModeToggleProps = LabelHTMLAttributes<HTMLLabelElement> & ColorModeToggleOwnProps;

/* Color mode */
export const ColorModeToggle: ForwardRefExoticComponent<ColorModeToggleProps & RefAttributes<HTMLLabelElement>> = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, ColorModeToggleProps>(function ColorModeToggle({
  mode,
  defaultMode,
  storageKey = 'muxui-color-mode',
  disabled = false,
  onModeChange,
  className,
  children,
  ...props
}, ref) {
  const { choice, select } = useColorMode({ mode, defaultMode, storageKey, followSystem: false });
  const update = (selected: boolean) => {
    const next = selected ? 'dark' : 'light';
    select(next);
    onModeChange?.(next);
  };
  // React Aria's props type the handlers on Element, and these on the label; the rest is the label's native attributes.
  return h(AriaSwitch, { ...(props as AriaSwitchProps), ref, 'aria-label': props['aria-label'] ?? 'Toggle dark mode', isSelected: choice === 'dark', isDisabled: disabled, onChange: update, className: cx('muxui-color-mode-toggle', className), ...{ 'data-muxui-mode': choice } }, children);
});
