import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { SliderMotionFixture } from './slider-motion-fixture.mjs';

window.__sliderMotionRoot = hydrateRoot(document.getElementById('root'), React.createElement(SliderMotionFixture));
