import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { patternVariantExamples } from '../src/pattern-variants.mjs';
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
