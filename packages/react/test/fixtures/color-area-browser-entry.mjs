import React from 'react';
import { createRoot } from 'react-dom/client';
import { ColorArea } from '../../src/collections.mjs';

const changes = [];
globalThis.__muxuiColorAreaChanges = changes;

// A controlled hex value, the way an application keeps a color in state.
function Fixture() {
  const [value, setValue] = React.useState('#336699');
  React.useEffect(() => { document.documentElement.dataset.muxuiColorAreaReady = 'true'; }, []);
  return React.createElement(ColorArea, { 'aria-label': 'Color', value, onChange: (next) => { changes.push(next); setValue(next); } });
}

createRoot(document.getElementById('root')).render(React.createElement(Fixture));
