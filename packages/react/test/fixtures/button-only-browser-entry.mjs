import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Button } from '../../src/button.mjs';

hydrateRoot(
  document.getElementById('root'),
  React.createElement(Button, null, 'Save'),
);
document.documentElement.dataset.muxuiButtonHydrated = 'true';
