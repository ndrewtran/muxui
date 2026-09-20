import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Calendar, RangeCalendar } from '../../src/collections.mjs';
import { DatePicker, DateRangePicker } from '../../src/fields.mjs';

export function fixture(kind) {
  const Component = { calendar: Calendar, range: RangeCalendar, picker: DatePicker, 'range-picker': DateRangePicker }[kind];
  const defaultValue = kind.includes('range')
    ? { start: '2026-02-14', end: '2026-02-18' }
    : '2026-02-14';
  return React.createElement(React.StrictMode, null,
    React.createElement(Component, { label: 'Choose date', defaultValue }));
}

if (typeof window !== 'undefined') {
  const root = hydrateRoot(document.getElementById('root'), fixture(document.body.dataset.kind));
  window.unmountCalendar = () => root.unmount();
}
