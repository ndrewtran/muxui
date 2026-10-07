import assert from 'node:assert/strict';
import test from 'node:test';
import { blockExportName, blockStoryExports, selectionKeyOwners, slugForFamily } from '../src/block-pages.mjs';

const identifier = /^[A-Za-z_$][\w$]*$/u;

test('a variant slug becomes a valid story export, including one that starts with a digit', () => {
  assert.equal(blockExportName('css-grid'), 'CssGrid');
  assert.equal(blockExportName('hero'), 'Hero');
  for (const slug of ['2-column', '3-tier', '4k', '1']) {
    const exportName = blockExportName(slug);
    assert.match(exportName, identifier, slug);
    assert.ok(exportName.startsWith('Variant'), slug);
  }
  assert.equal(blockExportName('2-column'), 'Variant2Column');
});

test('story exports of one pattern must stay distinct from each other and from the page imports', () => {
  const variant = (variantSlug, importName) => ({ variantSlug, importName });
  assert.deepEqual(
    blockStoryExports('muxui:pattern:pricing', [variant('2-column', 'PricingTwoColumn'), variant('3-tier', 'PricingThreeTier')]),
    ['Variant2Column', 'Variant3Tier'],
  );
  // Two slugs can emit the same export once a digit slug is prefixed.
  assert.throws(
    () => blockStoryExports('muxui:pattern:pricing', [variant('2-column', 'A'), variant('variant-2-column', 'B')]),
    /muxui:pattern:pricing has two variants that both emit the story export Variant2Column/u,
  );
  // An export that matches an imported component, or React, would redeclare that binding.
  assert.throws(
    () => blockStoryExports('muxui:pattern:hero', [variant('hero', 'Hero')]),
    /variant hero emits the story export Hero, which its page already imports/u,
  );
  assert.throws(() => blockStoryExports('muxui:pattern:hero', [variant('react', 'Hero')]), /story export React, which its page already imports/u);
});

test('a block cannot share a selection key with a component family or another block', () => {
  const families = ['Button', 'GridList', 'TagSelect'].map((family) => ({ family, slug: slugForFamily(family) }));
  assert.equal(slugForFamily('TagSelect'), 'tag-select');
  const owners = selectionKeyOwners([...families, { family: 'Poster grid', slug: 'poster-grid' }]);
  assert.equal(owners.get('poster-grid').family, 'Poster grid');
  assert.equal(owners.get('grid-list').family, 'GridList');
  assert.equal(owners.get('button').family, 'Button');
  // The slug normalisation is the one the selection uses, so `grid-list` shadows GridList.
  assert.throws(() => selectionKeyOwners([...families, { family: 'Grid of lists', slug: 'grid-list' }]), /"grid-list" selects both GridList and Grid of lists/u);
  assert.throws(() => selectionKeyOwners([...families, { family: 'Hero', slug: 'button' }]), /"button" selects both Button and Hero/u);
  // A name that differs from a family only by case selects the same key.
  assert.throws(() => selectionKeyOwners([...families, { family: 'button', slug: 'my-button' }]), /"button" selects both Button and button/u);
  // Two blocks collide the same way.
  assert.throws(() => selectionKeyOwners([{ family: 'Hero', slug: 'hero' }, { family: 'Hero banner', slug: 'hero' }]), /"hero" selects both Hero and Hero banner/u);
});
