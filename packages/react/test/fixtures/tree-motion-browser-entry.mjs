import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TreeMotionFixture } from './tree-motion-fixture.mjs';

hydrateRoot(document.querySelector('#root'), React.createElement(TreeMotionFixture));
