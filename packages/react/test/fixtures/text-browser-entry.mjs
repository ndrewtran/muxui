import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TextBrowserFixture } from './text-browser-fixture.mjs';
import '/packages/react/generated/styles.css';

hydrateRoot(document.getElementById('root'), React.createElement(TextBrowserFixture));
