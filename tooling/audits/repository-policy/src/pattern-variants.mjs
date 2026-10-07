import { readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';

/**
 * Enumerates the variant examples of every pattern ("block") the catalog source
 * manifest declares, in manifest order and then variant order. Every consumer
 * of the variants shares this one derivation: the packed type test, the packed
 * SSR and hydration proof, and the generated Storybook stories, so none of
 * them can skip a variant. Each entry carries the pattern and variant records'
 * names and the variant source path and text.
 */
export async function patternVariantExamples(repositoryRoot, manifestPath = 'packages/catalog/catalog-sources.json') {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, manifestPath), 'utf8'));
  const readRecord = async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
  const examples = new Map();
  for (const { family, path } of manifest.records) {
    if (family !== 'example') continue;
    const record = await readRecord(path);
    examples.set(record.id, record);
  }
  const variants = [];
  for (const { family, path } of manifest.records) {
    if (family !== 'pattern') continue;
    const pattern = await readRecord(path);
    for (const { example } of pattern.variants) {
      const record = examples.get(example);
      if (record === undefined) {
        throw new Error(`MUXUI_PATTERN_VARIANT_MISSING: ${pattern.id} lists ${example}, which the catalog source manifest does not declare`);
      }
      variants.push({
        patternId: pattern.id,
        patternSlug: pattern.id.slice('muxui:pattern:'.length),
        patternName: pattern.name,
        category: pattern.category,
        variantId: record.id,
        variantSlug: posix.basename(record.source, '.tsx'),
        variantName: record.name,
        source: record.source,
        text: await readFile(resolve(repositoryRoot, record.source), 'utf8'),
      });
    }
  }
  return variants;
}
