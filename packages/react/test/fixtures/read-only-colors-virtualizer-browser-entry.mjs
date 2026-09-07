import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ColorArea, ColorSlider, ColorSwatch, ColorWheel, Virtualizer } from '../../src/collections.mjs';

const changes = [];
globalThis.__muxuiReadOnlyColorChanges = changes;

function Fixture() {
  return React.createElement('div', { id: 'proof-fixture' },
    React.createElement(ColorArea, {
      'aria-label': 'Read-only color area',
      defaultValue: '#ff0000',
      readOnly: true,
      onChange: (value) => changes.push(['area', value]),
    }),
    React.createElement(ColorSlider, {
      'aria-label': 'Read-only red channel',
      channel: 'red',
      defaultValue: '#ff0000',
      readOnly: true,
      onChange: (value) => changes.push(['slider', value]),
    }),
    React.createElement(ColorWheel, {
      'aria-label': 'Read-only color wheel',
      defaultValue: '#ff0000',
      innerRadius: 20,
      outerRadius: 40,
      readOnly: true,
      onChange: (value) => changes.push(['wheel', value]),
    }),
    React.createElement(ColorSwatch, { color: '#ff0000', disabled: true }),
    React.createElement(Virtualizer, {
      'aria-label': 'Overscan proof list',
      height: 120,
      itemHeight: 40,
      items: Array.from({ length: 50 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` })),
      overscan: 2,
    }),
  );
}

hydrateRoot(document.getElementById('root'), React.createElement(Fixture));
