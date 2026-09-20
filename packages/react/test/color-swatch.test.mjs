import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { I18nProvider } from 'react-aria-components';
import { ColorSwatch, ColorPicker } from '../src/collections.mjs';

const h = React.createElement;
function swatch(props, locale = 'en-US') {
  const html = renderToStaticMarkup(h(I18nProvider, { locale }, h(ColorSwatch, props)));
  return new JSDOM(html).window.document.querySelector('.muxui-color-swatch');
}

test('ColorSwatch preserves the default preview and describes both colours in a split preview', () => {
  const single = swatch({ color: '#ff0000' });
  assert.equal(single.dataset.shape, 'square');
  assert.equal(single.hasAttribute('data-two-tone'), false);
  assert.equal(single.style.backgroundColor, 'rgb(255, 0, 0)');
  assert.match(single.getAttribute('aria-label'), /red/i);

  const split = swatch({ color: '#ff000080', secondaryColor: '#0000ff80', shape: 'circle', id: 'theme', 'aria-label': 'Workspace' });
  assert.equal(split.id, 'theme');
  assert.equal(split.dataset.shape, 'circle');
  assert.equal(split.hasAttribute('data-two-tone'), true);
  assert.equal(split.style.backgroundColor, 'transparent');
  assert.match(split.style.getPropertyValue('--muxui-color-swatch-primary'), /rgba\(255, 0, 0, 0\.5/);
  assert.match(split.style.getPropertyValue('--muxui-color-swatch-secondary'), /rgba\(0, 0, 255, 0\.5/);
  assert.match(split.getAttribute('aria-label'), /red.*blue.*Workspace/i);
  assert.equal(split.getAttribute('role'), 'img');
  assert.equal(split.hasAttribute('secondaryColor'), false);

  const named = swatch({ color: '#ff0000', secondaryColor: '#0000ff', colorName: 'Warm and cool', 'aria-label': 'Workspace' });
  assert.equal(named.getAttribute('aria-label'), 'Warm and cool, Workspace');
  assert.match(swatch({ color: '#ff0000', secondaryColor: '#0000ff', colorName: ' ' }).getAttribute('aria-label'), /red.*blue/i);
  assert.match(swatch({ color: '#ff0000', secondaryColor: '#0000ff' }, 'fr-FR').getAttribute('aria-label'), /rouge.*bleu/i);
});

test('ColorSwatch rejects invalid shape/secondary colour and retains picker disabled state', () => {
  assert.throws(() => swatch({ color: '#ff0000', secondaryColor: 'not-a-color' }), /secondaryColor values must be valid/);
  assert.throws(() => swatch({ color: '#ff0000', shape: 'triangle' }), /shape must be square or circle/);
  const html = renderToStaticMarkup(h(ColorPicker, { label: 'Theme', disabled: true }, h(ColorSwatch, { color: '#ff0000', secondaryColor: '#0000ff' })));
  assert.equal(new JSDOM(html).window.document.querySelector('.muxui-color-swatch').getAttribute('data-disabled'), 'true');
});
