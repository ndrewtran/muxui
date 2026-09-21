import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { PopoverMotionFixture } from './popover-motion-fixture.mjs';

globalThis.__muxuiPopoverRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(PopoverMotionFixture),
);
