import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, createRef } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import {
  Input as AriaInput,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  TextField as AriaTextField,
} from 'react-aria-components';
import { JSDOM } from 'jsdom';
import { TextField } from '../src/components.mjs';
import { Text } from '../src/supplemental/index.mjs';
import { installDom } from './support/dom.mjs';

const h = React.createElement;

test('Text SSR keeps native host semantics, role, slots, and canonical classes', () => {
  const html = renderToStaticMarkup(h(React.Fragment, null,
    h(Text, {
      as: 'h2',
      variant: 'heading',
      size: 'md',
      color: 'muted',
      role: 'note',
      slot: 'label',
      'aria-describedby': 'context',
      'data-testid': 'heading',
    }, 'Heading'),
    h(Text, { truncate: true, className: 'consumer-class' }, 'A long value'),
  ));
  assert.match(html, /<h2 class="muxui-text muxui-text--heading-md muxui-text--muted" role="note" slot="label" aria-describedby="context" data-testid="heading">Heading<\/h2>/u);
  assert.match(html, /class="muxui-text muxui-text--body-md muxui-text--truncate consumer-class"/u);
  assert.match(html, />A long value<\/span>/u);
});

function parse(html) {
  return new JSDOM(html).window.document;
}

test('Text participates in a React Aria description slot', () => {
  const document = parse(renderToStaticMarkup(h(AriaTextField, { 'aria-label': 'Name' },
    h(Text, { slot: 'description' }, 'Use your full name.'),
    h(AriaInput, { name: 'name' }),
  )));
  const description = document.querySelector('.muxui-text');
  assert.equal(description?.className, 'muxui-text muxui-text--body-md');
  assert.ok(description.id, 'the description slot assigns an id');
  const describedBy = document.querySelector('input')?.getAttribute('aria-describedby') ?? '';
  assert.ok(describedBy.split(' ').includes(description.id), 'the input references the Text description');
});

test('Text fills ListBoxItem label and description slots', () => {
  const document = parse(renderToStaticMarkup(h(AriaListBox, { 'aria-label': 'Accounts' },
    h(AriaListBoxItem, { id: 'account', textValue: 'Account' },
      h(Text, { slot: 'label' }, 'Account'),
      h(Text, { slot: 'description', color: 'muted' }, 'Primary workspace account.'),
    ),
  )));
  const option = document.querySelector('[role="option"]');
  const [label, description] = document.querySelectorAll('.muxui-text');
  assert.ok(option && label?.id && description?.id);
  assert.equal(option.getAttribute('aria-labelledby'), label.id);
  assert.equal(option.getAttribute('aria-describedby'), description.id);
});

test('unslotted Text joins the default item label slot in ListBoxItem and MenuItem', () => {
  const cases = [
    [h(AriaListBox, { 'aria-label': 'People' }, h(AriaListBoxItem, { id: 'alice', textValue: 'Alice' },
      h(Text, null, 'Alice'),
      h(Text, { slot: 'description' }, 'Owner'))), '[role="option"]'],
    [h(AriaMenu, { 'aria-label': 'Actions' }, h(AriaMenuItem, { id: 'rename', textValue: 'Rename' },
      h(Text, null, 'Rename'),
      h(Text, { slot: 'description' }, 'Change the file name'))), '[role="menuitem"]'],
  ];
  for (const [tree, itemSelector] of cases) {
    const document = parse(renderToStaticMarkup(tree));
    const item = document.querySelector(itemSelector);
    const [label, description] = item.querySelectorAll('.muxui-text');
    assert.ok(label?.id, `${itemSelector} label Text receives an id`);
    assert.equal(item.getAttribute('aria-labelledby'), label.id);
    assert.ok(item.getAttribute('aria-describedby')?.split(' ').includes(description.id));
  }
});

test('Text without a slot renders inside field labels and descriptions', () => {
  const html = renderToStaticMarkup(h(TextField, {
    label: h(React.Fragment, null, 'Name ', h(Text, { color: 'muted' }, '(optional)')),
    description: h(React.Fragment, null, 'Shown on ', h(Text, { variant: 'mono' }, 'profile')),
  }));
  const document = parse(html);
  const label = document.querySelector('label');
  assert.equal(label?.querySelector('.muxui-text--muted')?.textContent, '(optional)');
  assert.equal(label.querySelector('.muxui-text')?.hasAttribute('slot'), false);
  assert.equal(document.querySelector('.muxui-text--mono-md')?.textContent, 'profile');
  assert.equal(document.querySelector('input')?.getAttribute('aria-labelledby'), label.id);
});

test('Text hydrates server markup inside a field without mismatches', async () => {
  const element = h(AriaTextField, { 'aria-label': 'Name' },
    h(Text, { slot: 'description' }, 'Use your full name.'),
    h(AriaInput, { name: 'name' }),
    h(Text, { as: 'p', variant: 'title', size: 'sm', truncate: true }, 'Profile'),
  );
  const server = renderToString(element);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const restore = installDom(dom);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let root;
  try {
    const before = document.querySelector('.muxui-text--body-md');
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, { onRecoverableError: (error) => errors.push(String(error)) }); });
    assert.deepEqual(errors, []);
    assert.equal(document.querySelector('.muxui-text--body-md'), before, 'hydration reuses the server node');
    const description = document.querySelector('.muxui-text--body-md');
    assert.ok((document.querySelector('input')?.getAttribute('aria-describedby') ?? '').split(' ').includes(description?.id));
    assert.equal(document.querySelector('p')?.className, 'muxui-text muxui-text--title-sm muxui-text--truncate');
  } finally {
    await act(async () => root?.unmount());
    console.error = original;
    restore();
    dom.window.close();
  }
});

test('Text rejects sizes that have no canonical role token', () => {
  assert.throws(
    () => renderToStaticMarkup(h(Text, { variant: 'heading', size: 'xs' }, 'Invalid')),
    /Text size must be one of: sm, md, lg/u,
  );
  assert.throws(
    () => renderToStaticMarkup(h(Text, { size: 'm' }, 'Former type-scale name')),
    /Text size must be one of: xs, sm, md, lg/u,
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
    assert.equal(headingRef.current?.classList.contains('muxui-text--title-md'), true);
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});
