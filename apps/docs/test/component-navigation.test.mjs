import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { componentCategory, componentRecordCategories, groupComponentNavigation } from '../../component-navigation.mjs';
import { componentRecordCategory } from '../src/lib/component-categories.ts';

const record = (slug, category) => ({ id: `muxui:component:${slug}`, kind: 'component', record: category === undefined ? {} : { category } });

test('component navigation membership follows the category on the record in the bundle', () => {
  const categories = componentRecordCategories({
    artifacts: [
      record('button'),
      // A component the navigation module has never heard of joins the group by its record alone.
      record('tool-call', 'ai-agent'),
      record('card'),
      record('transcript', 'ai-agent'),
      // Only component records count.
      { id: 'muxui:guide:agents', kind: 'guide', record: { category: 'ai-agent' } },
    ],
  });
  assert.deepEqual([...categories.keys()], ['button', 'tool-call', 'card', 'transcript']);
  const groups = groupComponentNavigation([...categories.keys()].map((slug) => ({ slug })), ({ slug }) => categories.get(slug));
  assert.deepEqual(groups.map(({ label, items }) => [label, items.map(({ slug }) => slug)]), [
    ['AI Agent', ['tool-call', 'transcript']],
    ['Components', ['button', 'card']],
  ]);
});

test('component navigation rejects a category without a group', () => {
  assert.equal(componentCategory(undefined), 'Components');
  assert.equal(componentCategory('ai-agent'), 'AI Agent');
  assert.throws(() => componentCategory('misc'), /category misc has no navigation group/u);
  assert.throws(() => componentCategory('toString'), /has no navigation group/u);
  assert.throws(() => groupComponentNavigation(['stray'], () => 'misc'), /has no navigation group/u);
});

test('the shipped bundle carries every component record category, and each one has a group', () => {
  const { catalogJson } = createRequire(import.meta.url)('@muxui/catalog/bundle');
  const categories = componentRecordCategories(JSON.parse(catalogJson));
  assert.ok(categories.size > 0);
  for (const [slug, category] of categories) {
    // A bundle older than its record would group a component by a stale category.
    const source = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../catalog/components', slug, 'artifact.json'), 'utf8'));
    assert.equal(category, source.category, slug);
    assert.equal(componentCategory(componentRecordCategory(slug)), componentCategory(category), slug);
  }
  assert.throws(() => componentRecordCategory('absent'), /no component record for absent/u);
});
