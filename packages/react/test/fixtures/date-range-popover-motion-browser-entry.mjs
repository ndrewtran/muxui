import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { DateRangePicker } from '../../src/fields.mjs';

function Fixture() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    window.__muxuiDateRangePopoverSetOpen = setOpen;
    document.documentElement.dataset.muxuiDateRangePopoverHydrated = 'true';
    return () => { delete window.__muxuiDateRangePopoverSetOpen; };
  }, []);
  return React.createElement(DateRangePicker, {
    label: 'Date range',
    defaultValue: { start: '2026-08-20', end: '2026-08-26' },
    open,
    onOpenChange: setOpen,
  });
}

window.__muxuiDateRangePopoverRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(Fixture),
);
