import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HeavyBrowserFixture } from './heavy-browser-fixture.mjs';
import '../../generated/styles.css';

globalThis.__heavyFixtureRoot = hydrateRoot(document.getElementById('root'), React.createElement(HeavyBrowserFixture, { interactive: true }));
