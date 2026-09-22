import React from 'react';
import { I18nProvider } from 'react-aria-components';
import { ColorPicker, ColorSlider } from '../../src/collections.mjs';

export function ColorSliderMotionFixture() {
  const [value, setValue] = React.useState('#406699');
  const [options, setOptions] = React.useState({});
  const ref = React.useRef(null);
  const changes = React.useRef([]);
  React.useEffect(() => {
    window.__colorSliderProof = { ref, changes, setOptions };
    return () => { delete window.__colorSliderProof; };
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
  );
}
