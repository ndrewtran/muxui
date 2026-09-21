import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { LightboxMotionFixture } from './lightbox-motion-fixture.mjs';
import '../../src/supplemental/lightbox.css';

globalThis.__muxuiLightboxRoot = hydrateRoot(
  document.getElementById('root'),
  React.createElement(LightboxMotionFixture),
);
