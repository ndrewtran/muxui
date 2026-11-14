import React from 'react';

// A color scheme: the two values `data-muxui-color-scheme` takes and a saved choice can hold.
export type ColorMode = 'light' | 'dark';

// What a color mode control can choose: a scheme, or the operating system's preference.
export type ColorModeChoice = ColorMode | 'system';

type ColorModeOptions = {
  /** The choice when the page controls it. */
  mode: ColorModeChoice | undefined;
  /** The choice the control starts with, before a saved choice or the operating system's preference is read. */
  defaultMode: ColorModeChoice | undefined;
  storageKey: string;
  /** Whether System is a choice that follows the operating system. Without it, the preference is read once as a fallback. */
  followSystem: boolean;
};

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function savedMode(storageKey: string): ColorMode | undefined {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be disabled by privacy settings; the default and the operating system still decide.
  }
  return undefined;
}

/**
 * The mode state ColorModeToggle and ColorModePicker share: the storage key and format (`light` or `dark`, absent for
 * System), the scheme written to the document root, and the restore order.
 *
 * The first render uses `defaultMode` (System when the control follows it, else light) so server rendering and the
 * first client render match. After mount the saved choice wins, then `defaultMode`, then the operating system's
 * preference. Nothing is written until that restore ran, so a saved choice is never overwritten by the default.
 */
export function useColorMode({ mode, defaultMode, storageKey, followSystem }: ColorModeOptions) {
  const [internalMode, setInternalMode] = React.useState<ColorModeChoice>(defaultMode ?? (followSystem ? 'system' : 'light'));
  const [restored, setRestored] = React.useState(false);
  React.useEffect(() => {
    const prefersDark = () => window.matchMedia?.(SYSTEM_DARK).matches;
    const next = savedMode(storageKey) ?? defaultMode ?? (followSystem ? 'system' : prefersDark() ? 'dark' : 'light');
    setInternalMode((previous) => previous === next ? previous : next);
    setRestored(true);
  }, [defaultMode, storageKey, followSystem]);
  const choice = mode ?? internalMode;
  React.useEffect(() => {
    if (!restored) return;
    const root = document.documentElement;
    if (choice !== 'system') {
      root.setAttribute('data-muxui-color-scheme', choice);
      try { window.localStorage.setItem(storageKey, choice); } catch { /* best effort */ }
      return;
    }
    try { window.localStorage.removeItem(storageKey); } catch { /* best effort */ }
    // System resolves the scheme now and again whenever the operating system's preference changes.
    const query = window.matchMedia?.(SYSTEM_DARK);
    const apply = () => root.setAttribute('data-muxui-color-scheme', query?.matches ? 'dark' : 'light');
    apply();
    query?.addEventListener('change', apply);
    return () => query?.removeEventListener('change', apply);
  }, [choice, restored, storageKey]);
  /** Records a user's choice when the control manages itself. A controlled control leaves it to the page. */
  const select = (next: ColorModeChoice) => {
    if (mode === undefined || mode === null) setInternalMode(next);
  };
  return { choice, select };
}
