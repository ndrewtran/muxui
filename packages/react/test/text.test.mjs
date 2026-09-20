import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  TextField as AriaTextField,
} from 'react-aria-components';
import { JSDOM } from 'jsdom';
import { Text } from '../src/supplemental/index.mjs';

const h = React.createElement;

function installDom(dom) {
  const keys = [
    'window',
    'document',
    'Element',
    'HTMLElement',
    'HTMLDivElement',
    'HTMLHeadingElement',
    'HTMLSpanElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLLabelElement',
    'HTMLUListElement',
    'HTMLLIElement',
    'HTMLButtonElement',
    'SVGElement',
    'Node',
    'MutationObserver',
    'CSS',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'Event',
    'KeyboardEvent',
    'MouseEvent',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, Object.fromEntries(keys.map((key) => [key, dom.window[key] ?? globalThis[key]])));
  globalThis.CSS ??= { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`) };
  dom.window.HTMLElement.prototype.attachEvent ??= () => {};
  dom.window.HTMLElement.prototype.detachEvent ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

test('Text SSR keeps native host semantics, role, slots, and canonical classes', () => {
  const html = renderToStaticMarkup(h(React.Fragment, null,
    h(Text, {
      as: 'h2',
      variant: 'heading',
      size: 'm',
      color: 'muted',
      role: 'note',
      slot: 'label',
      'aria-describedby': 'context',
      'data-testid': 'heading',
    }, 'Heading'),
    h(Text, { truncate: true, className: 'consumer-class' }, 'A long value'),
  ));
  assert.match(html, /<h2 class="muxui-text muxui-text--heading-m muxui-text--muted" role="note" slot="label" aria-describedby="context" data-testid="heading">Heading<\/h2>/u);
  assert.match(html, /class="muxui-text muxui-text--body-m muxui-text--truncate consumer-class"/u);
  assert.match(html, />A long value<\/span>/u);
});

test('Text participates in a React Aria description slot', () => {
  const html = renderToStaticMarkup(h(AriaTextField, { 'aria-label': 'Name' },
    h(Text, { slot: 'description' }, 'Use your full name.'),
    h(AriaInput, { name: 'name' }),
  ));
  assert.match(html, /class="muxui-text muxui-text--body-m"[^>]*slot="description"/u);
  assert.match(html, /aria-describedby="[^"]+"/u);
});

test('Text rejects sizes that have no canonical role token', () => {
  assert.throws(
    () => renderToStaticMarkup(h(Text, { variant: 'heading', size: 'xs' }, 'Invalid')),
    /Text size must be one of: s, m, l/u,
  );
  assert.throws(
    () => renderToStaticMarkup(h(Text, { as: 'article' }, 'Invalid')),
    /Text as must be one of/u,
  );
});

test('Text refs resolve to the selected native host', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const spanRef = createRef();
  const headingRef = createRef();
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(h(React.Fragment, null,
      h(Text, { ref: spanRef }, 'Body'),
      h(Text, { ref: headingRef, as: 'h3', variant: 'title' }, 'Title'),
    )));
    assert.equal(spanRef.current?.tagName, 'SPAN');
    assert.equal(headingRef.current?.tagName, 'H3');
    assert.equal(headingRef.current?.classList.contains('muxui-text--title-m'), true);
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});
