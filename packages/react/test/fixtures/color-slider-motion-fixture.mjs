import React from 'react';
import { I18nProvider } from 'react-aria-components';
import { ColorPicker, ColorSlider, ColorWheel } from '../../src/collections.mjs';

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
    React.createElement(ColorSlider, {
      id: 'controlled', label: 'Red', ref, value, ...options,
      onChange: (next) => { changes.current.push(next); setValue(next); },
    }),
    React.createElement(ColorSlider, { id: 'uncontrolled', label: 'Uncontrolled', defaultValue: '#406699' }),
    React.createElement(I18nProvider, { locale: 'ar' },
      React.createElement(ColorSlider, { id: 'rtl', 'aria-label': 'RTL red', defaultValue: '#406699' })),
    React.createElement(ColorSlider, { id: 'vertical', 'aria-label': 'Vertical red', orientation: 'vertical', defaultValue: '#406699' }),
    React.createElement(ColorPicker, { readOnly: true, defaultValue: '#406699' },
      React.createElement(ColorSlider, { id: 'picker', label: 'Read-only picker' })),
    React.createElement(ColorSlider, { id: 'disabled', label: 'Disabled', defaultValue: '#406699', disabled: true }),
    React.createElement(ColorWheel, {
      id: 'wheel',
      'aria-label': 'Hue',
      ref: wheelRef,
      outerRadius: 48,
      innerRadius: 28,
      value: wheelValue,
      ...wheelOptions,
      onChange: (next) => { wheelChanges.current.push(next); setWheelValue(next); },
    }),
  );
}
