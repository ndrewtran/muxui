import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Tooltip } from '../src/overlays.ts';

const h = React.createElement;

// Tooltip.Shortcut renders on the server as a hidden span: one kbd per key, or its children when it has no keys to show,
// including an empty list. The browser proof is test/browser/tooltip-shortcut.test.mjs.
test('Tooltip.Shortcut renders its keys, or its children without keys, hidden from assistive technology', () => {
  for (const keys of [undefined, []]) assert.match(renderToString(h(Tooltip.Shortcut, { keys }, 'Ctrl B')), />Ctrl B</u, JSON.stringify(keys));
  const markup = renderToString(h(Tooltip.Shortcut, { keys: ['Ctrl', 'B'], className: 'extra' }, 'fallback'));
  assert.doesNotMatch(markup, /fallback/u);
  assert.match(markup, /^<span aria-hidden="true" class="muxui-tooltip__shortcut extra"><kbd class="muxui-tooltip__shortcut-key">Ctrl<\/kbd><kbd class="muxui-tooltip__shortcut-key">B<\/kbd><\/span>$/u);
});
