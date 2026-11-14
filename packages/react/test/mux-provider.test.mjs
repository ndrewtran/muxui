import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Breadcrumbs, Link } from '../src/components.ts';
import { NumberField } from '../src/fields.ts';
import { MuxProvider } from '../src/mux-provider.ts';
import { createDom } from './support/dom.mjs';

const amount = () => React.createElement(NumberField, {
  label: 'Amount', defaultValue: 1234.5, step: 0.01, formatOptions: { style: 'currency', currency: 'EUR' },
});
const inputValue = (markup) => /<input[^>]* value="([^"]*)"/u.exec(markup)?.[1];

test('MuxProvider sets the locale components format in, on the server and unchanged through hydration', async () => {
  const german = () => React.createElement(MuxProvider, { locale: 'de-DE' }, amount());
  const server = renderToString(german());
  // Without a provider the server renders en-US, which the browser's language would replace after hydration.
  assert.equal(inputValue(renderToString(amount())), '€1,234.50');
  assert.equal(inputValue(server), '1.234,50 €');

  const { restore } = createDom(`<div id="root">${server}</div>`);
  try {
    const root = document.querySelector('#root');
    const recoverable = [];
    await act(async () => { hydrateRoot(root, german(), { onRecoverableError: (error) => recoverable.push(error) }); });
    assert.deepEqual(recoverable, []);
    assert.equal(root.querySelector('input').value, '1.234,50 €');
  } finally {
    restore();
  }
});

test('MuxProvider hands link activation to navigate and leaves modified clicks to the browser', async () => {
  const visited = [];
  const { restore } = createDom('<div id="root"></div>', { globals: ['location'] });
  try {
    const root = document.querySelector('#root');
    const mounted = createRoot(root);
    // Registered after React's own root listener, so it sees whether the link handler took the click.
    const claimed = [];
    root.addEventListener('click', (event) => { claimed.push(event.defaultPrevented); event.preventDefault(); });
    await act(async () => {
      mounted.render(React.createElement(MuxProvider, { navigate: (href) => visited.push(href) },
        React.createElement(Link, { href: '/next' }, 'Next'),
        React.createElement(Breadcrumbs, { 'aria-label': 'Path', items: [{ label: 'Home', href: '/home' }, { label: 'Here' }] })));
    });
    const anchor = root.querySelector('a.muxui-link');
    const crumb = root.querySelector('a.muxui-breadcrumbs__link');
    await act(async () => { anchor.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    await act(async () => { anchor.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); });
    await act(async () => { crumb.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    assert.deepEqual(visited, ['/next', '/home']);
    assert.deepEqual(claimed, [true, false, true]);
    await act(async () => { mounted.unmount(); });
  } finally {
    restore();
  }
});
