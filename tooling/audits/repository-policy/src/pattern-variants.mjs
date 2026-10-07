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

/**
 * Lists each pattern the catalog source manifest declares with the component
 * slugs its participants name, in manifest order. CI impact planning derives
 * its pattern routes from this: a changed participant component plans the
 * patterns that use it.
 */
export async function patternParticipants(repositoryRoot, manifestPath = 'packages/catalog/catalog-sources.json') {
  const source = await readFile(resolve(repositoryRoot, manifestPath), 'utf8').catch((error) => {
    // A repository with no source manifest declares no pattern.
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (source === null) return [];
  const manifest = JSON.parse(source);
  const patterns = [];
  for (const { family, path } of manifest.records) {
    if (family !== 'pattern') continue;
    const pattern = JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
    patterns.push({
      slug: pattern.id.slice('muxui:pattern:'.length),
      components: pattern.participants.map(({ component }) => component.slice('muxui:component:'.length)),
    });
  }
  return patterns;
}

/**
 * The slugs of patterns whose catalog source manifest entries differ between two
 * manifest texts (either may be missing): an added or removed pattern record,
 * variant example, or asset reference changes the generated Block pages.
 */
export function changedPatternSlugs(beforeText, afterText) {
  const entries = (text) => new Set(text ? JSON.parse(text).records.map(({ path }) => path).filter((path) => path.startsWith('catalog/patterns/')) : []);
  const [before, after] = [entries(beforeText), entries(afterText)];
  const changed = [...before].filter((path) => !after.has(path)).concat([...after].filter((path) => !before.has(path)));
  return [...new Set(changed.map((path) => path.split('/')[2]))].sort();
}
