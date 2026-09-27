import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { GridListMotionFixture } from './grid-list-motion-fixture.mjs';

hydrateRoot(document.getElementById('root'), React.createElement(GridListMotionFixture));
