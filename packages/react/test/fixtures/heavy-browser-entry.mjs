import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HeavyBrowserFixture } from './heavy-browser-fixture.mjs';
import '../../src/text-editor/text-editor.css';
import '../../src/markdown/markdown.css';
import '../../src/supplemental/resizable.css';
import '../../src/supplemental/lightbox.css';
import '../../src/supplemental/styles.css';

globalThis.__heavyFixtureRoot = hydrateRoot(document.getElementById('root'), React.createElement(HeavyBrowserFixture, { interactive: true }));
