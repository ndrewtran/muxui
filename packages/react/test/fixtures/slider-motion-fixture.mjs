import React from 'react';
import { Slider } from '../../src/collections.mjs';

export function SliderMotionFixture() {
  const [value, setValue] = React.useState(60);
  const [options, setOptions] = React.useState({});
  const ref = React.useRef(null);
  const changes = React.useRef([]);
  const ends = React.useRef([]);

  React.useEffect(() => {
    window.__sliderMotionProof = { ref, changes, ends, setOptions, setValue };
    return () => { delete window.__sliderMotionProof; };
  }, []);

  return React.createElement(React.Fragment, null,
    React.createElement(Slider, {
      id: 'controlled',
      label: 'Volume',
      ref,
      value,
      ...options,
      max: 100,
      min: 0,
      onChange: (next) => { changes.current.push(next); setValue(next); },
      onChangeEnd: (next) => ends.current.push(next),
      step: 1,
    }),
    React.createElement(Slider, {
      id: 'vertical',
      'aria-label': 'Vertical volume',
      defaultValue: 40,
      orientation: 'vertical',
    }),
    React.createElement(Slider, {
      id: 'disabled',
      'aria-label': 'Disabled volume',
      defaultValue: 40,
      disabled: true,
    }),
    React.createElement(Slider, {
      id: 'read-only',
      'aria-label': 'Read-only volume',
      defaultValue: 40,
      readOnly: true,
    }),
  );
}
