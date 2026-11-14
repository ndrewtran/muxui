import React from 'react';
import { Popover } from '../../src/overlays.ts';
import { Button } from '../../src/button.ts';

const h = React.createElement;

/** A Popover whose panel holds text and a button, so a test can read what each paints in the panel's scheme. */
export function PopoverColorSchemeFixture({ colorScheme, defaultOpen }) {
  return h('main', null,
    h(Popover, { 'aria-label': 'Appearance', colorScheme, defaultOpen, trigger: h(Button, { id: 'trigger' }, 'Open') },
      h('p', { id: 'panel-text' }, 'Panel text'),
      h(Button, { id: 'panel-button' }, 'Action')));
}
