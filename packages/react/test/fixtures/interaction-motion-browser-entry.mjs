import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { InteractionMotionFixture } from './interaction-motion-fixture.mjs';

window.__interactionHydrationRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(InteractionMotionFixture),
);
