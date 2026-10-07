import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { changedPatternSlugs, patternParticipants, patternVariantExamples } from '../src/pattern-variants.mjs';
import { assertPatternVariantMarkup, expectedRowVariantIds } from '../src/pattern-variant-markup.mjs';
import { provePatternVariants } from '../src/pattern-variant-proof.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

test('pattern variants are enumerated from the catalog manifest in variant order', async () => {
  const variants = await patternVariantExamples(repositoryRoot);
  const posterGrid = variants.filter(({ patternSlug }) => patternSlug === 'poster-grid');
  assert.deepEqual(posterGrid.map(({ variantId, variantSlug, variantName }) => [variantId, variantSlug, variantName]), [
    ['muxui:example:poster-grid-css-grid', 'css-grid', 'CSS grid'],
    ['muxui:example:poster-grid-virtualized', 'virtualized', 'Virtualized'],
  ]);
  for (const variant of posterGrid) {
    assert.equal(variant.patternId, 'muxui:pattern:poster-grid');
    assert.equal(variant.patternName, 'Poster grid');
    assert.equal(variant.category, 'collections');
    assert.equal(variant.source, `catalog/patterns/poster-grid/examples/react/${variant.variantSlug}.tsx`);
    assert.match(variant.text, /^import \{[^}]*\} from '@muxui\/react';$/mu);
  }
});

test('a pattern variant the manifest does not declare fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-pattern-variants-'));
  try {
    const write = async (path, value) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
    };
    await write('catalog-sources.json', { records: [{ family: 'pattern', path: 'p/artifact.json' }] });
    await write('p/artifact.json', { id: 'muxui:pattern:lonely', name: 'Lonely', category: 'hero', variants: [{ example: 'muxui:example:lonely-one' }] });
    await assert.rejects(
      patternVariantExamples(root, 'catalog-sources.json'),
      /MUXUI_PATTERN_VARIANT_MISSING: muxui:pattern:lonely lists muxui:example:lonely-one/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// The packed SSR and hydration proof (E-BL1-03) installs a clean consumer, so it
// stays out of this hermetic check. Run it with
// `pnpm --filter @muxui/repository-policy run proof:pattern-variants`; release
// preparation also renders every variant from the packed package.
test('the packed variant proof fails closed before packing when no variant is selected', async () => {
  await assert.rejects(provePatternVariants({ patterns: ['no-such-pattern'] }), /MUXUI_PATTERN_VARIANT_PROOF_EMPTY: no variant belongs to no-such-pattern/u);
});

const cssGrid = 'muxui:example:poster-grid-css-grid';
const virtualized = 'muxui:example:poster-grid-virtualized';
const markup = '<div class="muxui-grid-list" role="grid"></div>';
const failure = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const check = (variantId, counts, html = markup) => assertPatternVariantMarkup({ variantId, html, fail: failure, ...counts });

test('a variant that server-renders no row cannot pass the packed proof', () => {
  assert.doesNotThrow(() => check(cssGrid, { serverRows: 12, hydratedRows: 12 }));
  assert.throws(() => check(cssGrid, { serverRows: 0, hydratedRows: 0 }), /MUXUI_PATTERN_VARIANT_PROOF_EMPTY: .*rendered 0 role="row" elements for serverRows, expected 12/u);
  assert.throws(() => check(cssGrid, { serverRows: 12, hydratedRows: 11 }), /for hydratedRows, expected 12/u);
});

test('the virtualized variant must mount some rows, and only a window of them, after a measured hydration', () => {
  assert.doesNotThrow(() => check(virtualized, { serverRows: 0, hydratedRows: 12 }));
  assert.throws(() => check(virtualized, { serverRows: 0, hydratedRows: 0 }), /for hydratedRows, expected 1 to 999/u);
  assert.throws(() => check(virtualized, { serverRows: 0, hydratedRows: 1000 }), /for hydratedRows, expected 1 to 999/u);
});

test('every variant needs Mux UI server markup, with or without a row expectation', () => {
  assert.throws(() => check('muxui:example:other-block', { serverRows: 0, hydratedRows: 0 }, '<div></div>'), /rendered no Mux UI markup/u);
  assert.doesNotThrow(() => check('muxui:example:other-block', { serverRows: 0, hydratedRows: 0 }));
});

test('row expectations name variants the catalog declares', async () => {
  const declared = (await patternVariantExamples(repositoryRoot)).map(({ variantId }) => variantId);
  for (const id of expectedRowVariantIds) assert.ok(declared.includes(id), `${id} is not a declared pattern variant`);
});

test('pattern participants name the component slugs each pattern record declares', async () => {
  const patterns = await patternParticipants(repositoryRoot);
  assert.deepEqual(patterns.find(({ slug }) => slug === 'poster-grid'), {
    slug: 'poster-grid',
    components: ['grid-list', 'virtualizer', 'image', 'text', 'link', 'button'],
  });
  // A repository without a source manifest declares no pattern.
  assert.deepEqual(await patternParticipants(tmpdir(), 'no-such-manifest.json'), []);
});

test('only entries under catalog/patterns change a pattern', () => {
  const manifest = (...paths) => JSON.stringify({ records: paths.map((path) => ({ family: 'x', path })) });
  const poster = 'catalog/patterns/poster-grid/artifact.json';
  assert.deepEqual(changedPatternSlugs(manifest('a.json'), manifest('a.json', poster)), ['poster-grid']);
  assert.deepEqual(changedPatternSlugs(manifest('a.json', poster), manifest('a.json')), ['poster-grid']);
  assert.deepEqual(changedPatternSlugs(manifest(poster), manifest(poster)), []);
  assert.deepEqual(changedPatternSlugs(manifest('a.json'), manifest('a.json', 'b.json')), []);
  assert.deepEqual(changedPatternSlugs(undefined, manifest('catalog/patterns/hero/artifact.json', poster)), ['hero', 'poster-grid']);
});
