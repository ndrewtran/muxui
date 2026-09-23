import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ToggleButtonGroupMotionFixture } from './toggle-button-group-motion-fixture.mjs';

hydrateRoot(document.getElementById('root'), React.createElement(ToggleButtonGroupMotionFixture));
