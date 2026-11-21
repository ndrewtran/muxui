import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Badge } from '../src/supplemental/badge.ts';

const h = React.createElement;
const parse = (element) => new JSDOM(renderToString(element)).window.document.querySelector('.muxui-badge');

test('Badge renders passive text with its tone and variant, and a decorative icon', () => {
  const badge = parse(h(Badge, { tone: 'success', variant: 'solid', icon: h('svg', { className: 'icon' }), className: 'own', id: 'flag' }, 'Solved'));
  assert.equal(badge.tagName, 'SPAN');
  assert.equal(badge.className, 'muxui-badge own');
  assert.equal(badge.id, 'flag');
  assert.equal(badge.getAttribute('role'), null);
  assert.equal(badge.getAttribute('tabindex'), null);
  assert.equal(badge.getAttribute('data-muxui-tone'), 'success');
  assert.equal(badge.getAttribute('data-muxui-variant'), 'solid');
  assert.equal(badge.querySelector('.muxui-badge__icon').getAttribute('aria-hidden'), 'true');
  assert.equal(badge.querySelector('.muxui-badge__text').textContent, 'Solved');
  assert.equal(badge.querySelector('.muxui-badge__text').getAttribute('aria-hidden'), null, 'without a label the text is read');
  assert.equal(badge.querySelector('.muxui-badge__label'), null);
  const plain = parse(h(Badge, null, 'Author'));
  assert.deepEqual([plain.getAttribute('data-muxui-tone'), plain.getAttribute('data-muxui-variant')], ['neutral', 'soft']);
  assert.equal(plain.querySelector('.muxui-badge__icon'), null);
});

test('a Badge label is read in place of its visible text', () => {
  const badge = parse(h(Badge, { label: '12 unread' }, '12'));
  assert.equal(badge.querySelector('.muxui-badge__text').getAttribute('aria-hidden'), 'true');
  assert.equal(badge.querySelector('.muxui-badge__label').textContent, '12 unread');
  assert.equal(parse(h(Badge, { label: '' }, '12')).querySelector('.muxui-badge__label'), null, 'an empty label adds nothing');
});

test('Badge keeps a role or focus stop from an untyped caller off the badge, and refuses an unknown tone or variant', () => {
  const badge = parse(h(Badge, { role: 'button', tabIndex: 0, 'aria-hidden': true }, 'New'));
  assert.equal(badge.getAttribute('role'), null);
  assert.equal(badge.getAttribute('tabindex'), null);
  assert.equal(badge.getAttribute('aria-hidden'), 'true', 'native attributes such as aria-hidden pass through');
  assert.throws(() => renderToString(h(Badge, { tone: 'red' }, 'x')), /Badge tone must be one of: neutral, brand, success, warning, error\./u);
  assert.throws(() => renderToString(h(Badge, { variant: 'outline' }, 'x')), /Badge variant must be one of: soft, solid\./u);
});
