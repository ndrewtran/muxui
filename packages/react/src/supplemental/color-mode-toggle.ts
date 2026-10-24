import React from 'react';
import type { ForwardRefExoticComponent, LabelHTMLAttributes, RefAttributes } from 'react';
import { Switch as AriaSwitch } from 'react-aria-components';
import type { SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { h, cx } from './part-utils.ts';

export type ColorMode = 'light' | 'dark';

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
  // Keep the first render deterministic so an SSR light default hydrates
  // cleanly before browser-only storage or OS preference restoration runs.
  const [internalMode, setInternalMode] = React.useState<ColorMode>(defaultMode === undefined || defaultMode === null ? 'light' : defaultMode);
  React.useEffect(() => {
    let nextMode = defaultMode;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') nextMode = saved;
    } catch {
      // Storage can be disabled by privacy settings; OS/default mode still works.
    }
    nextMode ??= window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setInternalMode((previous) => previous === nextMode ? previous : nextMode);
  }, [defaultMode, storageKey]);
  const currentMode = mode === undefined || mode === null ? internalMode : mode;
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-muxui-color-scheme', currentMode);
    try { window.localStorage.setItem(storageKey, currentMode); } catch { /* best effort */ }
  }, [currentMode, storageKey]);
  const update = (selected: boolean) => {
    const next = selected ? 'dark' : 'light';
    if (mode === undefined) setInternalMode(next);
    onModeChange?.(next);
  };
  // React Aria's props type the handlers on Element, and these on the label; the rest is the label's native attributes.
  return h(AriaSwitch, { ...(props as AriaSwitchProps), ref, 'aria-label': props['aria-label'] ?? 'Toggle dark mode', isSelected: currentMode === 'dark', isDisabled: disabled, onChange: update, className: cx('muxui-color-mode-toggle', className), ...{ 'data-mode': currentMode } }, children);
});
