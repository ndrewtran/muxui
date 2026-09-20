import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { DatePicker } from '../../src/fields.mjs';

function Fixture() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    window.__muxuiDatePopoverSetOpen = setOpen;
    document.documentElement.dataset.muxuiDatePopoverHydrated = 'true';
    return () => { delete window.__muxuiDatePopoverSetOpen; };
  }, []);
  return React.createElement(DatePicker, {
    label: 'Due date',
    defaultValue: '2026-08-26',
    open,
    onOpenChange: setOpen,
  });
}

window.__muxuiDatePopoverRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(Fixture),
);
window.__muxuiDatePopoverUnmount = () => window.__muxuiDatePopoverRoot.unmount();
