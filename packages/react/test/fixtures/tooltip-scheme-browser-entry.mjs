import React from 'react';
import { createRoot } from 'react-dom/client';
import '/generated/styles.css';
import '/generated/themes.css';
import { TooltipSchemeFixture } from './tooltip-scheme-fixture.mjs';

// The page picks the content with ?content=, and opens the Tooltip with ?open=1.
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(React.createElement(TooltipSchemeFixture, {
  content: params.get('content') ?? undefined,
  defaultOpen: params.get('open') === '1',
}));
