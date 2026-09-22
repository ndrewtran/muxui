import React from 'react';
import { DateRangePicker } from '../../src/fields.mjs';

export function RangeSelectionMotionFixture() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(true);
  const [changes, setChanges] = React.useState(0);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiRangeSelectionHydrated = 'true';
    window.__muxuiRangeSetOpen = setOpen;
    window.__muxuiRangeUnmount = () => setMounted(false);
    return () => {
      delete window.__muxuiRangeSetOpen;
      delete window.__muxuiRangeUnmount;
    };
  }, []);

  if (!mounted) return React.createElement('div', { id: 'range-unmounted' });

  return React.createElement('main', null,
    React.createElement('output', { id: 'range-change-count' }, String(changes)),
    React.createElement(DateRangePicker, {
      label: 'Date range',
      defaultValue: { start: '2026-08-20', end: '2026-08-26' },
      open,
      onOpenChange: setOpen,
      onChange: () => setChanges((count) => count + 1),
      unavailableDateMatcher: (date) => date === '2026-08-10',
    }),
  );
}
