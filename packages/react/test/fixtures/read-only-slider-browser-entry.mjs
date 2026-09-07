import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Slider } from '../../src/collections.mjs';

const changes = [];
globalThis.__muxuiReadOnlySliderChanges = changes;

hydrateRoot(document.getElementById('root'), React.createElement(Slider, {
  'aria-label': 'Read-only volume',
  defaultValue: 50,
  max: 100,
  min: 0,
  onChange: (value) => changes.push(value),
  readOnly: true,
  step: 1,
}));
