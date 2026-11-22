import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createDom } from './support/dom.mjs';

const installDom = () => createDom('<div id="root"></div>', { layoutStubs: true });

const moduleEnvironment = installDom();
const { Dialog } = await import('../src/overlays.ts');
moduleEnvironment.restore();

// The browser proof (test/browser/dialog-sheet.test.mjs) covers the sheet's geometry, motion, drag and paint; these
// cases cover what the markup says before and after hydration.

test('Dialog presentation is center or sheet', () => {
  assert.throws(() => renderToString(React.createElement(Dialog, { title: 'Filters', presentation: 'bottom' }, 'Body')), /Dialog presentation must be one of: center, sheet/u);
});

test('the server renders only the trigger of a sheet that starts open', () => {
  const markup = renderToString(React.createElement(Dialog, { title: 'Filters', presentation: 'sheet', defaultOpen: true, trigger: React.createElement('button', { type: 'button' }, 'Open') }, 'Body'));
  assert.match(markup, /muxui-dialog__trigger/u);
  assert.doesNotMatch(markup, /role="dialog"|muxui-dialog__grip|data-muxui-presentation/u);
});

test('the panel and backdrop reflect the presentation, and only a dismissable sheet leads with a hidden grip', async () => {
  const cases = [
    { props: {}, presentation: 'center', grip: false },
    { props: { presentation: 'sheet' }, presentation: 'sheet', grip: true },
    { props: { presentation: 'sheet', dismissable: false }, presentation: 'sheet', grip: false },
  ];
  for (const { props, presentation, grip } of cases) {
    const env = installDom();
    const root = createRoot(document.querySelector('#root'));
    try {
      await act(async () => root.render(React.createElement(Dialog, { title: 'Filters', defaultOpen: true, ...props }, 'Body')));
      const panel = document.body.querySelector('.muxui-dialog');
      assert.equal(panel.getAttribute('data-muxui-presentation'), presentation);
      assert.equal(panel.closest('.muxui-dialog__backdrop').getAttribute('data-muxui-presentation'), presentation);
      const node = panel.querySelector(':scope > .muxui-dialog__grip');
      assert.equal(node !== null, grip, `${JSON.stringify(props)} grip`);
      if (node) {
        assert.equal(panel.firstElementChild, node, 'the grip leads the panel');
        assert.equal(node.getAttribute('aria-hidden'), 'true');
        assert.equal(node.hasAttribute('tabindex'), false);
      }
      // The close button is the same named control in either presentation, and absent when the Dialog is not dismissable.
      assert.equal(panel.querySelectorAll('.muxui-dialog__close[aria-label="Close dialog"]').length, props.dismissable === false ? 0 : 1);
    } finally {
      await act(async () => root.unmount());
      env.restore();
    }
  }
});
