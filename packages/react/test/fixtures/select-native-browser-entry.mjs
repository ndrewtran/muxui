import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { SelectNativeBrowserFixture } from './select-native-browser-fixture.mjs';
import '../../generated/styles.css';

hydrateRoot(document.getElementById('root'), React.createElement(SelectNativeBrowserFixture));
