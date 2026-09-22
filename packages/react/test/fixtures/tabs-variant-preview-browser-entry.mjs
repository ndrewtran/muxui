import React from 'react';
import { createRoot } from 'react-dom/client';
import { TabsVariantPreviewFixture } from './tabs-variant-preview-fixture.mjs';

const root = createRoot(document.getElementById('root'));
globalThis.__muxuiTabsPreviewRoot = root;
root.render(React.createElement(TabsVariantPreviewFixture));
