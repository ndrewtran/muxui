import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Banner } from '../src/supplemental/banner.ts';
import { createDom } from './support/dom.mjs';

const h = React.createElement;
const parse = (element) => new JSDOM(renderToString(element)).window.document;
const actions = [{ id: 'one', label: 'One', onAction: () => {} }, { id: 'two', label: 'Two', onAction: () => {} }];

test('Banner is a region named by its label, then its title, then Notice, and an alert when asked', () => {
  const full = parse(h(Banner, { title: 'Maintenance', icon: h('svg'), actions, link: { label: 'Status', href: '/status' }, dismissible: true, className: 'site', id: 'notice' }, 'Read-only on Saturday.')).querySelector('section');
  assert.equal(full.getAttribute('role'), 'region');
  assert.equal(full.className, 'muxui-banner site');
  assert.equal(full.id, 'notice');
  const title = full.querySelector('.muxui-banner__title');
  assert.equal(full.getAttribute('aria-labelledby'), title.id, 'the title names the region');
  assert.equal(full.querySelector('.muxui-banner__text').textContent, 'Maintenance Read-only on Saturday.');
  assert.equal(full.querySelector('.muxui-banner__icon').getAttribute('aria-hidden'), 'true');
  assert.deepEqual([...full.querySelectorAll('.muxui-banner__action')].map((node) => [node.tagName, node.textContent]), [['BUTTON', 'One'], ['BUTTON', 'Two']]);
  assert.equal(full.querySelector('a.muxui-banner__link').getAttribute('href'), '/status');
  assert.equal(full.querySelector('button.muxui-banner__dismiss').getAttribute('aria-label'), 'Dismiss notice');
  assert.deepEqual([full.dataset.muxuiTone, full.dataset.muxuiEmphasis, full.dataset.muxuiAlign], ['neutral', 'subtle', 'start']);

  const labelled = parse(h(Banner, { title: 'Maintenance', label: 'Site notice' }, 'Text')).querySelector('section');
  assert.equal(labelled.getAttribute('aria-label'), 'Site notice');
  assert.equal(labelled.getAttribute('aria-labelledby'), null);
  const plain = parse(h(Banner, null, 'Text')).querySelector('section');
  assert.equal(plain.getAttribute('aria-label'), 'Notice');
  assert.equal(plain.querySelector('.muxui-banner__actions, .muxui-banner__dismiss, .muxui-banner__icon, .muxui-banner__title'), null, 'nothing optional renders unasked');
  assert.equal(parse(h(Banner, { alert: true, role: 'note' }, 'Now')).querySelector('section').getAttribute('role'), 'alert');
});

test('Banner validates its options and takes at most two actions', () => {
  assert.throws(() => renderToString(h(Banner, { tone: 'info' }, 'x')), /Banner tone must be one of: neutral, brand, success, warning, danger\./u);
  assert.throws(() => renderToString(h(Banner, { emphasis: 'bold' }, 'x')), /Banner emphasis must be one of: subtle, solid\./u);
  assert.throws(() => renderToString(h(Banner, { align: 'end' }, 'x')), /Banner align must be one of: start, center\./u);
  assert.throws(() => renderToString(h(Banner, { actions: [...actions, { id: 'three', label: 'Three', onAction: () => {} }] }, 'x')), /Banner takes at most two actions\./u);
});

test('a custom colour sets the fill and the more contrasting of white and black, and anything else falls back to the tone', () => {
  const custom = (customColor) => parse(h(Banner, { tone: 'warning', emphasis: 'solid', customColor }, 'x')).querySelector('section');
  const cases = [['#6d28d9', 'rgb(109 40 217)', '#ffffff'], ['#fde047', 'rgb(253 224 71)', '#000000'], ['#FFF', 'rgb(255 255 255)', '#000000'], ['rgb(0, 0, 0)', 'rgb(0 0 0)', '#ffffff'], ['rgba(10 20 30 / 100%)', 'rgb(10 20 30)', '#ffffff'],
    // The grey where white and black meet: white 4.54:1, black 4.62:1.
    ['#767676', 'rgb(118 118 118)', '#000000']];
  for (const [input, fill, foreground] of cases) {
    const node = custom(input);
    assert.equal(node.dataset.muxuiTone, 'custom', input);
    assert.equal(node.style.getPropertyValue('--muxui-banner-custom'), fill, input);
    assert.equal(node.style.getPropertyValue('--muxui-banner-custom-foreground'), foreground, input);
  }
  for (const input of ['red', '#12345', 'rgba(0, 0, 0, 0.5)', 'rgb(0 0 0 / 50%)', 'rgb(300, 0, 0)', 'oklch(0.5 0.1 200)', '']) {
    const node = custom(input);
    assert.equal(node.dataset.muxuiTone, 'warning', `${input} falls back to the tone`);
    assert.equal(node.style.getPropertyValue('--muxui-banner-custom'), '', input);
  }
});

test('Banner dismissal is kept by Banner, or by the caller, and reported once per press', async () => {
  const { restore } = createDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const calls = [];
  const press = async () => act(async () => host.querySelector('.muxui-banner__dismiss').click());
  try {
    await act(async () => root.render(h(Banner, { dismissible: true, onDismiss: () => calls.push('own') }, 'Text')));
    await press();
    assert.equal(host.querySelector('.muxui-banner'), null, 'uncontrolled: the Banner goes');
    assert.deepEqual(calls, ['own']);

    await act(async () => root.render(h(Banner, { key: 'controlled', dismissible: true, dismissed: false, onDismiss: () => calls.push('controlled') }, 'Text')));
    await press();
    assert.ok(host.querySelector('.muxui-banner'), 'controlled: the Banner stays until the caller dismisses it');
    assert.deepEqual(calls, ['own', 'controlled']);
    await act(async () => root.render(h(Banner, { key: 'controlled', dismissible: true, dismissed: true }, 'Text')));
    assert.equal(host.querySelector('.muxui-banner'), null);

    await act(async () => root.render(h(Banner, { key: 'default', defaultDismissed: true }, 'Text')));
    assert.equal(host.querySelector('.muxui-banner'), null, 'defaultDismissed starts it dismissed');
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});

test('Banner hydrates its server markup without a mismatch and forwards its ref', async () => {
  const { restore } = createDom();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  const host = document.querySelector('#root');
  const ref = React.createRef();
  const element = h(Banner, { ref, title: 'Maintenance', customColor: '#6d28d9', emphasis: 'solid', actions, link: { label: 'Status', href: '/status' }, dismissible: true }, 'Text');
  host.innerHTML = renderToString(element);
  let root;
  try {
    await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(String(error)) }); });
    assert.deepEqual(errors, []);
    assert.equal(ref.current, host.querySelector('.muxui-banner'));
  } finally {
    await act(async () => root?.unmount());
    console.error = original;
    restore();
  }
});
