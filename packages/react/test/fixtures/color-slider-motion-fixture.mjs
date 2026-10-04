import React from 'react';
import { I18nProvider } from 'react-aria-components';
import { ColorPicker, ColorSlider, ColorWheel } from '../../src/collections.mjs';

// Colour controls admit no id, so each proof target is wrapped in a data-proof element.
const proof = (name, control) => React.createElement('div', { 'data-proof': name }, control);

export function ColorSliderMotionFixture() {
  const [value, setValue] = React.useState('#406699');
  const [options, setOptions] = React.useState({});
  const [wheelValue, setWheelValue] = React.useState('#406699');
  const [wheelOptions, setWheelOptions] = React.useState({});
  const ref = React.useRef(null);
  const wheelRef = React.useRef(null);
  const changes = React.useRef([]);
  const wheelChanges = React.useRef([]);
  React.useEffect(() => {
    window.__colorSliderProof = { ref, changes, setOptions };
    window.__colorWheelProof = { ref: wheelRef, changes: wheelChanges, setOptions: setWheelOptions, setValue: setWheelValue };
    return () => {
      delete window.__colorSliderProof;
      delete window.__colorWheelProof;
    };
  }, []);
  return React.createElement(React.Fragment, null,
    proof('controlled', React.createElement(ColorSlider, {
      label: 'Red', ref, value, ...options,
      onChange: (next) => { changes.current.push(next); setValue(next); },
    })),
    proof('uncontrolled', React.createElement(ColorSlider, { label: 'Uncontrolled', defaultValue: '#406699' })),
    React.createElement(I18nProvider, { locale: 'ar' },
      proof('rtl', React.createElement(ColorSlider, { 'aria-label': 'RTL red', defaultValue: '#406699' }))),
    proof('vertical', React.createElement(ColorSlider, { 'aria-label': 'Vertical red', orientation: 'vertical', defaultValue: '#406699' })),
    React.createElement(ColorPicker, { readOnly: true, defaultValue: '#406699' },
      proof('picker', React.createElement(ColorSlider, { label: 'Read-only picker' }))),
    proof('disabled', React.createElement(ColorSlider, { label: 'Disabled', defaultValue: '#406699', disabled: true })),
    proof('wheel', React.createElement(ColorWheel, {
      'aria-label': 'Hue',
      ref: wheelRef,
      outerRadius: 48,
      innerRadius: 28,
      value: wheelValue,
      ...wheelOptions,
      onChange: (next) => { wheelChanges.current.push(next); setWheelValue(next); },
    })),
  );
}
