import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { IconButtonFixture } from './icon-button-fixture.mjs';
import '@muxui/react/styles.css';

hydrateRoot(document.getElementById('root'), React.createElement(IconButtonFixture));
