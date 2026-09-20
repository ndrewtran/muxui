import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { SelectNativeBrowserFixture } from './select-native-browser-fixture.mjs';
import '../../src/styles/base.css';
import '../../src/supplemental/styles.css';
import '../../src/supplemental/select-native.css';

hydrateRoot(document.getElementById('root'), React.createElement(SelectNativeBrowserFixture));
