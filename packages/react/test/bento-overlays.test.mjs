import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createDom } from './support/dom.mjs';

const installDom = (markup) => createDom(markup, { globals: ['File', 'Blob', 'FileReader'], layoutStubs: true });

const moduleEnvironment = installDom();
const { Dialog, Popover, PreviewTrigger, Tooltip } = await import('../src/overlays.mjs');
const { AlertDialog } = await import('../src/supplemental/index.mjs');
moduleEnvironment.restore();
const h = React.createElement;
const trigger = h('button', null, 'Open');

function alertDialog({ descriptionId, describedby, description = true, ...props } = {}) {
  return h(AlertDialog.Root, { defaultOpen: true, ...props },
    h(AlertDialog.Trigger, null, 'Delete'),
    h(AlertDialog.Backdrop, null, h(AlertDialog.Popup, null,
      h(AlertDialog.Content, { 'aria-describedby': describedby },
        h(AlertDialog.Title, null, 'Delete item?'),
        description && h(AlertDialog.Description, { id: descriptionId }, 'This cannot be undone.'),
        h(AlertDialog.Actions, { className: 'custom-alert-actions' }, h(AlertDialog.Close, null, 'Cancel'))))));
}

function assertAssociation(dialog, attribute, texts) {
  const ids = dialog.getAttribute(attribute)?.split(/\s+/u) ?? [];
  assert.ok(ids.length > 0, `${attribute} exists`);
  assert.deepEqual(ids.map((id) => document.getElementById(id)?.textContent), texts);
}

test('anchored overlays accept logical alignments and reject malformed geometry before rendering', () => {
  const placements = ['top', 'bottom', 'start', 'end', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'start-top', 'start-bottom', 'end-top', 'end-bottom'];
  for (const Component of [Popover, PreviewTrigger, Tooltip]) {
    const props = { trigger, 'aria-label': 'Details', content: 'Helpful text' };
    for (const placement of placements) assert.doesNotThrow(() => renderToString(h(Component, { ...props, placement }, 'Details')));
    for (const invalid of [{ placement: 'left' }, { placement: 'top start' }, { offset: Infinity }, { offset: '2' }, { crossOffset: NaN }, { containerPadding: -1 }, { shouldFlip: 0 }]) {
      assert.throws(() => renderToString(h(Component, { ...props, ...invalid }, 'Details')), TypeError);
    }
  }
  assert.throws(() => renderToString(h(Popover, { trigger, 'aria-label': 'Details', modal: 'false' })), /modal must be a boolean/u);
});

test('new overlay props are SSR/hydration safe and clean up open portals', async () => {
  const fixture = () => h(React.Fragment, null,
    h(Dialog, { title: 'Review', description: 'Review this change.', actions: h('button', null, 'Save'), open: true, trigger }),
    h(Popover, { trigger, 'aria-label': 'Details', placement: 'bottom-start', modal: false, anchorRef: { current: null } }, 'Details'),
    h(Tooltip, { trigger, content: 'Help', placement: 'end-bottom', anchorRef: { current: null } }),
    alertDialog({ defaultOpen: false }));
  const server = renderToString(fixture());
  assert.doesNotMatch(server, /muxui-dialog-backdrop|muxui-popover-positioner|muxui-tooltip|muxui-alert-dialog__backdrop/u);
  const env = installDom(`<div id="root">${server}</div>`);
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), fixture(), { onRecoverableError: (error) => errors.push(error.message) }); });
    assert.deepEqual(errors, []);
    await act(async () => root.render(h(Dialog, { title: 'Review', description: 'Review this change.', open: true })));
    assertAssociation(document.querySelector('[role="dialog"]'), 'aria-describedby', ['Review this change.']);
    await act(async () => root.unmount());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.querySelector('[data-overlay-container]'), null);
  } finally {
    env.restore();
  }
});

test('Dialog composes named parts and merges descriptions without leaking part props', async () => {
  const env = installDom('<div id="root"></div><p id="external-description">Additional context.</p>');
  const root = createRoot(document.querySelector('#root'));
  try {
    const props = { title: 'Review', description: 'Check the changes.', 'aria-describedby': 'external-description', open: true,
      actions: h('button', null, 'Save'), className: 'consumer-dialog', panelClassName: 'custom-panel', backdropClassName: 'custom-backdrop', titleClassName: 'custom-title', descriptionClassName: 'custom-description', contentClassName: 'custom-content', actionsClassName: 'custom-actions', closeClassName: 'custom-close' };
    await act(async () => root.render(h(Dialog, props, h('input', { 'aria-label': 'Name' }))));
    const dialog = document.querySelector('[role="dialog"]');
    assertAssociation(dialog, 'aria-labelledby', ['Review']);
    assertAssociation(dialog, 'aria-describedby', ['Additional context.', 'Check the changes.']);
    assert.equal(document.querySelector('#root').getAttribute('aria-hidden'), 'true');
    assert.ok(dialog.classList.contains('consumer-dialog'));
    assert.ok(dialog.classList.contains('custom-panel'));
    for (const part of ['backdrop', 'title', 'description', 'content', 'actions', 'close']) assert.ok(document.querySelector(`.muxui-dialog-${part}.custom-${part}`));
    assert.equal(dialog.hasAttribute('panelClassName'), false);
    const id = document.querySelector('.muxui-dialog-description').id;
    await act(async () => root.render(h(Dialog, { ...props, title: 'Updated review' })));
    assert.equal(document.querySelector('.muxui-dialog-description').id, id);
    await act(async () => root.render(h(Dialog, { ...props, description: null, actions: null, dismissable: false })));
    assertAssociation(dialog, 'aria-describedby', ['Additional context.']);
    assert.equal(document.querySelector('.muxui-dialog-description'), null);
    assert.equal(document.querySelector('.muxui-dialog-actions'), null);
    assert.equal(document.querySelector('.muxui-dialog-close'), null);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('AlertDialog associates default and explicit descriptions and merges caller references', async () => {
  const env = installDom('<div id="root"></div><p id="external-description">Additional context.</p>');
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(alertDialog()));
    const dialog = document.querySelector('[role="alertdialog"]');
    assertAssociation(dialog, 'aria-labelledby', ['Delete item?']);
    assertAssociation(dialog, 'aria-describedby', ['This cannot be undone.']);
    const defaultId = document.querySelector('.muxui-alert-dialog__description').id;
    await act(async () => root.render(alertDialog()));
    assert.equal(document.querySelector('.muxui-alert-dialog__description').id, defaultId);
    await act(async () => root.render(alertDialog({ descriptionId: 'authored-description' })));
    assert.equal(document.querySelector('.muxui-alert-dialog__description').id, 'authored-description');
    assertAssociation(dialog, 'aria-describedby', ['This cannot be undone.']);
    await act(async () => root.render(alertDialog({ descriptionId: 'authored-description', describedby: 'external-description' })));
    assertAssociation(dialog, 'aria-describedby', ['Additional context.', 'This cannot be undone.']);
    await act(async () => root.render(alertDialog({ describedby: 'external-description' })));
    assertAssociation(dialog, 'aria-describedby', ['Additional context.', 'This cannot be undone.']);
    await act(async () => root.render(alertDialog({ descriptionId: 'authored-description', describedby: 'external-description authored-description' })));
    assertAssociation(dialog, 'aria-describedby', ['Additional context.', 'This cannot be undone.']);
  } finally {
    await act(async () => root.unmount());
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    env.restore();
  }
});
