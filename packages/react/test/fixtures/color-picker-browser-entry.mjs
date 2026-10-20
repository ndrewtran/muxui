import React from 'react';
import { createRoot } from 'react-dom/client';
import { ColorArea, ColorPicker, ColorSlider } from '../../src/collections.mjs';

const changes = [];
globalThis.__muxuiColorPickerChanges = changes;

// A hex black held in application state, with a hue slider and an area.
function Fixture() {
  const [value, setValue] = React.useState('#000000');
  React.useEffect(() => { document.documentElement.dataset.muxuiColorPickerReady = 'true'; }, []);
  return React.createElement(ColorPicker, { value, onChange: (next) => { changes.push(next); setValue(next); } },
    React.createElement(ColorArea, { 'aria-label': 'Area' }),
    React.createElement(ColorSlider, { 'aria-label': 'Hue', channel: 'hue', colorSpace: 'hsb' }));
}

createRoot(document.getElementById('root')).render(React.createElement(Fixture));
