import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { SwitchMotionFixture } from './switch-motion-fixture.mjs';

if (typeof window !== 'undefined') {
  const root = hydrateRoot(document.getElementById('root'), React.createElement(SwitchMotionFixture));
  document.documentElement.dataset.switchMotionReady = 'true';
  window.unmountSwitchMotion = () => root.unmount();
}
