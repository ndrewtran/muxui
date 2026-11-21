import React from 'react';
import { Tooltip } from '../../src/overlays.ts';
import { ColorSwatch } from '../../src/color-swatch.ts';

const h = React.createElement;

// Tinted content of the kinds a tooltip can hold: a keyboard hint drawn with the scheme's tokens, and a Mux UI
// ColorSwatch, whose border the stylesheet sets per scheme.
const hint = (id) => h('span', { id },
  h('kbd', { style: { backgroundColor: 'var(--muxui-semantic-surface-subtle)', color: 'var(--muxui-semantic-content-default)', borderColor: 'var(--muxui-semantic-border-default)', borderStyle: 'solid', borderWidth: '1px' } }, 'S'),
  h(ColorSwatch, { color: '#3b82f6', colorName: 'Blue' }));

/**
 * A Tooltip around a native button, holding plain text or the tinted hint, and the same hint on the page itself, so a
 * test can compare what the tooltip's content resolves with what a page of the other scheme resolves.
 */
export function TooltipSchemeFixture({ content = 'hint', defaultOpen = false }) {
  return h('main', { style: { padding: '96px' } },
    h(Tooltip, {
      content: content === 'text' ? 'Save the draft' : h('span', null, 'Save ', hint('tooltip-hint')),
      defaultOpen,
      trigger: h('button', { id: 'trigger', type: 'button' }, 'Save'),
    }),
    h('div', null, hint('page-hint')));
}
