import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { Tabs } from '../src/collections.mjs';

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
  assert.match(defaultMarkup, /data-variant="underline"/u);
  assert.match(defaultMarkup, /data-muxui-tabs-variant="underline"/u);
  assert.match(defaultMarkup, /role="tablist"/u);
  assert.match(defaultMarkup, /role="tab"/u);
  assert.match(defaultMarkup, /role="tabpanel"/u);

  for (const variant of variants) {
    const markup = renderTabs({ variant });
    assert.match(markup, new RegExp(`data-variant="${variant}"`, 'u'));
    assert.match(markup, new RegExp(`data-muxui-tabs-variant="${variant}"`, 'u'));
  }
  assert.throws(() => renderTabs({ variant: 'rail' }), /Tabs variant must be one of/u);
  assert.throws(() => renderTabs({ variant: null }), /Tabs variant must be one of/u);
});

test('Tabs canonical artifact and generated type document the visual variants', async () => {
  const [artifact, generatedTypes] = await Promise.all([
    readFile(resolve(import.meta.dirname, '../../../catalog/components/tabs/artifact.json'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../generated/index.d.ts'), 'utf8'),
  ]);
  const binding = JSON.parse(artifact).bindings['web.react'];
  assert.ok(binding.api.props.includes('variant'));
  assert.equal(binding.api.defaults.variant, 'underline');
  assert.match(binding.behavior.join(' '), /underline, pill, overflow, and segment/u);
  assert.match(generatedTypes, /variant\?: 'underline' \| 'pill' \| 'overflow' \| 'segment'/u);
});
