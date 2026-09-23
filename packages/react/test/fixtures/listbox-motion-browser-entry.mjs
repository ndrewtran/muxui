import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ListBoxMotionFixture } from './listbox-motion-fixture.mjs';

hydrateRoot(document.getElementById('root'), React.createElement(ListBoxMotionFixture));
