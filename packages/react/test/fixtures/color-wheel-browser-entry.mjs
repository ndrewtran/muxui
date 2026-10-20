import React from 'react';
import { createRoot } from 'react-dom/client';
import { ColorPicker, ColorWheel } from '../../src/collections.mjs';

const changes = { wheel: [], picker: [] };
globalThis.__muxuiColorWheelChanges = changes;

// Hex grays held in application state, the way an application keeps a color: a lone wheel and a wheel in a picker.
function Fixture() {
  const [wheel, setWheel] = React.useState('#808080');
  const [picker, setPicker] = React.useState('#808080');
  React.useEffect(() => { document.documentElement.dataset.muxuiColorWheelReady = 'true'; }, []);
  return React.createElement('div', { style: { display: 'flex', gap: 24 } },
    React.createElement(ColorWheel, { 'aria-label': 'Wheel', value: wheel, onChange: (next) => { changes.wheel.push(next); setWheel(next); } }),
    React.createElement(ColorPicker, { value: picker, onChange: (next) => { changes.picker.push(next); setPicker(next); } },
      React.createElement(ColorWheel, { 'aria-label': 'Picker wheel' })));
}

createRoot(document.getElementById('root')).render(React.createElement(Fixture));
