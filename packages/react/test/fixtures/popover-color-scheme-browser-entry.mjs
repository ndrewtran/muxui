import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '/generated/styles.css';
import '/generated/themes.css';
import { PopoverColorSchemeFixture } from './popover-color-scheme-fixture.mjs';

// The page picks the Popover's scheme with ?cs=, opens it with ?open=1, and hydrates server markup with ?hydrate=1.
const params = new URLSearchParams(location.search);
const element = React.createElement(PopoverColorSchemeFixture, { colorScheme: params.get('cs') ?? undefined, defaultOpen: params.get('open') === '1' });
const host = document.getElementById('root');
if (params.get('hydrate') === '1') hydrateRoot(host, element);
else createRoot(host).render(element);
