import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TabsMotionFixture } from './tabs-motion-fixture.mjs';

globalThis.__muxuiTabsRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(TabsMotionFixture),
);
