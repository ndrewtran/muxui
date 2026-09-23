import React from 'react';
import { Switch } from '../../src/fields.mjs';

export function SwitchMotionFixture() {
  const [selected, setSelected] = React.useState(false);
  return React.createElement('main', { id: 'switch-motion-fixture' },
    React.createElement('div', { id: 'primary-switch' },
      React.createElement(Switch, { label: 'Notifications', selected, onChange: setSelected })),
    React.createElement('div', { id: 'default-on-switch' },
      React.createElement(Switch, { label: 'Default on', defaultSelected: true })),
    React.createElement('div', { id: 'disabled-off-switch' },
      React.createElement(Switch, { label: 'Disabled off', disabled: true })),
    React.createElement('div', { id: 'disabled-on-switch' },
      React.createElement(Switch, { label: 'Disabled on', defaultSelected: true, disabled: true })),
    React.createElement('div', { id: 'readonly-switch' },
      React.createElement(Switch, { label: 'Read only', defaultSelected: true, readOnly: true })),
  );
}
