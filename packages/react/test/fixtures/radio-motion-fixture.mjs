import React from 'react';
import { RadioGroup } from '../../src/collections.mjs';
import { RadioField } from '../../src/supplemental/index.mjs';

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three', disabled: true },
  { value: 'four', label: 'Four' },
];

function compoundOptions() {
  return [
    ['one', 'One'],
    ['two', 'Two'],
    ['three', 'Three'],
  ].map(([value, label]) => React.createElement(RadioField.Root, { key: value, value, disabled: value === 'three' },
    React.createElement(RadioField.Button, null,
      React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)),
      label)));
}

export function RadioMotionFixture() {
  const [controlled, setControlled] = React.useState('one');
  const [mounted, setMounted] = React.useState(true);
  const changes = React.useRef([]);

  React.useEffect(() => {
    document.documentElement.dataset.muxuiRadioHydrated = 'true';
    window.__muxuiRadioProof = {
      changes,
      setControlled,
      unmount: () => setMounted(false),
    };
    return () => {
      delete window.__muxuiRadioProof;
    };
  }, []);

  if (!mounted) return React.createElement('div', { id: 'radio-unmounted' });

  return React.createElement('main', null,
    React.createElement('form', { id: 'radio-form' },
      React.createElement('div', { id: 'controlled' },
        React.createElement(RadioGroup, {
          'aria-label': 'Controlled plan',
          value: controlled,
          onChange: (next) => {
            changes.current.push(next);
            setControlled(next);
          },
          options,
        })),
      React.createElement('div', { id: 'uncontrolled' },
        React.createElement(RadioGroup, {
          'aria-label': 'Uncontrolled plan',
          defaultValue: 'one',
          options,
        })),
      React.createElement('div', { id: 'compound' },
        React.createElement(RadioGroup, {
          'aria-label': 'Compound plan',
          defaultValue: 'one',
        }, compoundOptions())),
      React.createElement('div', { id: 'keyboard' },
        React.createElement(RadioGroup, {
          'aria-label': 'Keyboard plan',
          defaultValue: 'one',
          options,
        })),
      React.createElement('div', { id: 'horizontal' },
        React.createElement(RadioGroup, {
          'aria-label': 'Horizontal plan',
          defaultValue: 'one',
          orientation: 'horizontal',
          options,
        })),
      React.createElement('div', { id: 'read-only' },
        React.createElement(RadioGroup, {
          'aria-label': 'Read-only plan',
          defaultValue: 'one',
          readOnly: true,
          options,
        })),
    ),
  );
}
