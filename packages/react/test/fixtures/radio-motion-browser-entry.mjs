import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { RadioMotionFixture } from './radio-motion-fixture.mjs';

globalThis.__muxuiRadioRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(RadioMotionFixture),
);
