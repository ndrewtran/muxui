import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RangeSelectionMotionFixture } from './range-selection-motion-fixture.mjs';

globalThis.__muxuiRangeSelectionRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(RangeSelectionMotionFixture),
);
