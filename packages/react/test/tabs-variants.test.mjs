import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { Tabs } from '../src/collections.mjs';
import { createDom } from './support/dom.mjs';

const items = [
  { id: 'overview', label: 'Overview', panel: 'Overview panel' },
  { id: 'activity', label: 'Activity', panel: 'Activity panel' },
];
const variants = ['underline', 'pill', 'overflow', 'segment'];

function renderTabs(props = {}) {
  return renderToString(React.createElement(Tabs, {
    items,
    'aria-label': 'Sections',
    ...props,
  }));
}

test('Tabs exposes a finite variant contract and preserves underline by default', async () => {
  const defaultMarkup = renderTabs();
  assert.match(defaultMarkup, /data-muxui-variant="underline"/u);
  assert.match(defaultMarkup, /data-muxui-tabs-variant="underline"/u);
  assert.match(defaultMarkup, /role="tablist"/u);
  assert.match(defaultMarkup, /role="tab"/u);
  assert.match(defaultMarkup, /role="tabpanel"/u);

  for (const variant of variants) {
    const markup = renderTabs({ variant });
    assert.match(markup, new RegExp(`data-muxui-variant="${variant}"`, 'u'));
    assert.match(markup, new RegExp(`data-muxui-tabs-variant="${variant}"`, 'u'));
  }
  assert.throws(() => renderTabs({ variant: 'rail' }), /Tabs variant must be one of/u);
  assert.throws(() => renderTabs({ variant: null }), /Tabs variant must be one of/u);
});

test('Tabs canonical artifact and generated type document the visual variants', async () => {
  const [artifact, derived, generatedTypes] = await Promise.all([
    readFile(resolve(import.meta.dirname, '../../../catalog/components/tabs/artifact.json'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../api/tabs.json'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../generated/tabs.d.ts'), 'utf8'),
  ]);
  const binding = JSON.parse(artifact).bindings['web.react'];
  const { api } = JSON.parse(derived);
  assert.ok(api.props.includes('variant'));
  assert.equal(api.defaults.variant, 'underline');
  assert.match(binding.behavior.join(' '), /underline, pill, overflow, and segment/u);
  assert.match(generatedTypes, /variant\?: 'underline' \| 'pill' \| 'overflow' \| 'segment'/u);
});

// React Aria reads a tablist's accessible name from the TabList's own props, and the Tabs root is a div with no role to name.
test('Tabs puts its accessible name on the tablist, in server markup and in the client DOM', async () => {
  for (const name of [{ 'aria-label': 'Sections' }, { 'aria-labelledby': 'sections-heading' }]) {
    const [[attribute, value]] = Object.entries(name);
    for (const variant of variants) {
      const element = React.createElement(Tabs, { items, variant, ...name });
      // The tablist carries the name and the role-less root does not (a tab panel's own aria-labelledby points at its tab).
      const named = (root) => [root.querySelector('[role="tablist"]'), root.querySelector('.muxui-tabs')].map((node) => node.getAttribute(attribute));
      assert.deepEqual(named(new JSDOM(renderToString(element)).window.document), [value, null], `${attribute} in ${variant} server markup`);

      const env = createDom();
      try {
        const root = createRoot(document.querySelector('#root'));
        await act(async () => root.render(element));
        assert.deepEqual(named(document), [value, null], `${attribute} in the ${variant} client DOM`);
        await act(async () => root.unmount());
      } finally {
        env.restore();
      }
    }
  }
});
