import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Skeleton } from '../src/supplemental/skeleton.ts';
import { createDom } from './support/dom.mjs';

const h = React.createElement;
const parse = (element) => new JSDOM(renderToString(element)).window.document;
const group = (props = {}) => h(Skeleton.Root, props,
  h(Skeleton.Circle, { size: 'sm' }),
  h(Skeleton.Line, { width: '40%' }),
  h(Skeleton.Block, { aspectRatio: '4 / 3' }));

test('Skeleton.Root renders one status with its label, and hidden shapes with their sizes', () => {
  const doc = parse(group({ label: 'Loading comments', className: 'feed', id: 'feed' }));
  const root = doc.querySelector('.muxui-skeleton');
  assert.equal(root.getAttribute('role'), 'status');
  assert.equal(root.className, 'muxui-skeleton feed');
  assert.equal(root.id, 'feed');
  assert.equal(root.querySelector('.muxui-skeleton__label').textContent, 'Loading comments');
  assert.equal(root.textContent, 'Loading comments', 'the label is the only text');
  const shapes = [...root.querySelectorAll('.muxui-skeleton__circle, .muxui-skeleton__line, .muxui-skeleton__block')];
  assert.deepEqual(shapes.map((shape) => [shape.tagName, shape.getAttribute('aria-hidden')]), [['SPAN', 'true'], ['SPAN', 'true'], ['SPAN', 'true']]);
  assert.equal(root.querySelector('.muxui-skeleton__circle').getAttribute('data-muxui-size'), 'sm');
  assert.equal(root.querySelector('.muxui-skeleton__line').style.inlineSize, '40%');
  assert.equal(root.querySelector('.muxui-skeleton__block').style.aspectRatio, '4 / 3');
  // The server has nothing measured, so it renders no sweep.
  assert.equal(root.querySelector('.muxui-skeleton__sweep'), null);
  assert.equal(parse(group()).querySelector('.muxui-skeleton__label').textContent, 'Loading');
});

test('Skeleton shapes take their sizes, and a block height replaces its aspect ratio', () => {
  const doc = parse(h('div', null,
    h(Skeleton.Line, { width: 120, style: { color: 'red' } }),
    h(Skeleton.Block, { width: '50%', height: 40, aspectRatio: '2 / 1' }),
    h(Skeleton.Circle)));
  const [line, block, circle] = ['line', 'block', 'circle'].map((part) => doc.querySelector(`.muxui-skeleton__${part}`));
  assert.equal(line.querySelectorAll('.muxui-skeleton__bar').length, 1, 'a line paints one bar');
  assert.equal(line.style.inlineSize, '120px');
  assert.equal(line.style.color, 'red', 'the caller style is kept');
  assert.equal(block.style.inlineSize, '50%');
  assert.equal(block.style.blockSize, '40px');
  assert.equal(block.style.aspectRatio, 'auto');
  assert.equal(circle.getAttribute('data-muxui-size'), 'md');
  assert.throws(() => renderToString(h(Skeleton.Circle, { size: 'xl' })), /Skeleton\.Circle size must be one of: sm, md, lg\./u);
});

test('Skeleton hydrates its server markup without a mismatch and forwards its refs', async () => {
  const { restore } = createDom();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  const host = document.querySelector('#root');
  const refs = { root: React.createRef(), line: React.createRef() };
  const element = h(Skeleton.Root, { ref: refs.root, label: 'Loading' }, h(Skeleton.Line, { ref: refs.line }));
  host.innerHTML = renderToString(element);
  let root;
  try {
    await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(String(error)) }); });
    assert.deepEqual(errors, []);
    assert.equal(refs.root.current, host.querySelector('.muxui-skeleton'));
    assert.equal(refs.line.current, host.querySelector('.muxui-skeleton__line'));
  } finally {
    await act(async () => root?.unmount());
    console.error = original;
    restore();
  }
});
