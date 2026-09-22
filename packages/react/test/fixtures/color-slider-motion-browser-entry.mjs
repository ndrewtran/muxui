import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ColorSliderMotionFixture } from './color-slider-motion-fixture.mjs';

window.__colorSliderRoot = hydrateRoot(document.getElementById('root'), React.createElement(ColorSliderMotionFixture));
