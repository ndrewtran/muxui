import React from 'react';
import { Switch as AriaSwitch } from 'react-aria-components';
import { h, cx } from './part-utils.mjs';

/* Color mode */
export const ColorModeToggle = React.forwardRef(function ColorModeToggle({
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
  const [internalMode, setInternalMode] = React.useState(defaultMode ?? 'light');
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
  const currentMode = mode ?? internalMode;
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-muxui-color-scheme', currentMode);
    try { window.localStorage.setItem(storageKey, currentMode); } catch { /* best effort */ }
  }, [currentMode, storageKey]);
  const update = (selected) => {
    const next = selected ? 'dark' : 'light';
    if (mode === undefined) setInternalMode(next);
    onModeChange?.(next);
  };
  return h(AriaSwitch, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Toggle dark mode', isSelected: currentMode === 'dark', isDisabled: disabled, onChange: update, className: cx('muxui-color-mode-toggle', className), 'data-mode': currentMode }, children);
});
