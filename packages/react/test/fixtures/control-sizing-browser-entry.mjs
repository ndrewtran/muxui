import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ControlSizingFixture } from './control-sizing-fixture.mjs';

globalThis.__muxuiControlSizingRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(ControlSizingFixture),
);
