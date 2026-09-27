import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { Calendar } from '../../src/collections.mjs';
import { DatePicker } from '../../src/fields.mjs';

function CalendarSelectionMotionFixture() {
  const [value, setValue] = React.useState('2026-02-14');
  const [primaryMotionPolicy, setPrimaryMotionPolicy] = React.useState('never');
  const onChange = (nextValue) => {
    setValue(nextValue);
    window.__muxuiCalendarSelectionProof?.changes.push(nextValue);
  };
  if (typeof window !== 'undefined' && window.__muxuiCalendarSelectionProof) {
    window.__muxuiCalendarSelectionProof.clearPrimary = () => setValue('2026-02-16');
    window.__muxuiCalendarSelectionProof.setPrimaryMotionPolicy = setPrimaryMotionPolicy;
  }

  return React.createElement('main', null,
    React.createElement('section', { id: 'primary' }, React.createElement(MotionConfig, { reducedMotion: primaryMotionPolicy }, React.createElement(Calendar, {
      label: 'Primary calendar', value, onChange,
    }))),
    React.createElement('section', { id: 'secondary' }, React.createElement(Calendar, {
      label: 'Independent calendar', defaultValue: '2026-02-14',
    })),
    React.createElement('section', { id: 'parent-reduced-motion' }, React.createElement(MotionConfig, { reducedMotion: 'always' }, React.createElement(Calendar, {
      label: 'Parent reduced motion calendar', defaultValue: '2026-02-14',
    }))),
    React.createElement('section', { id: 'date-picker' }, React.createElement(DatePicker, {
      label: 'Date picker', defaultValue: '2026-02-14',
    })));
}

export function fixture() {
  return React.createElement(CalendarSelectionMotionFixture);
}

if (typeof window !== 'undefined') {
  window.__muxuiCalendarSelectionProof = { changes: [] };
  const root = hydrateRoot(document.getElementById('root'), fixture());
  window.unmountCalendarSelectionFixture = () => root.unmount();
}
