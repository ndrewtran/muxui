import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import '../../generated/styles.css';
import { TooltipMotionFixture } from './tooltip-motion-fixture.mjs';

hydrateRoot(document.getElementById('root'), React.createElement(TooltipMotionFixture));
