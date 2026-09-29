import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const COMPONENTS_ROOT = 'catalog/components';

// Canonical component or example records that stay out of the manifest on
// purpose. Keys are repository-relative record paths; values give the reason.
export const MANIFEST_EXCLUSIONS = Object.freeze({
  'catalog/components/lightbox/artifact.json':
    'No example record yet. Adding one is blocked because the CI planner requires an exact Storybook page owner for example files (MUXUI_CI_IMPACT_STORY_PAGE_MISSING).',
  'catalog/components/markdown/artifact.json':
    'No example record yet. Adding one is blocked because the CI planner requires an exact Storybook page owner for example files (MUXUI_CI_IMPACT_STORY_PAGE_MISSING).',
  'catalog/components/resizable/artifact.json':
    'No example record yet. Adding one is blocked because the CI planner requires an exact Storybook page owner for example files (MUXUI_CI_IMPACT_STORY_PAGE_MISSING).',
  'catalog/components/text-editor/artifact.json':
    'No example record yet. Adding one is blocked because the CI planner requires an exact Storybook page owner for example files (MUXUI_CI_IMPACT_STORY_PAGE_MISSING).',
  'catalog/components/select/examples/react/composition.example.json':
    'Its source declares two executable exports; the docs example contract requires exactly one.',
  'catalog/components/tag-select/artifact.json':
    'Server render throws (TagSelect.Root reads an undefined id); excluded until the React runtime is fixed.',
  'catalog/components/tag-select/examples/react/basic.example.json':
    'Server render throws (TagSelect.Root reads an undefined id); excluded until the React runtime is fixed.',
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (entry.isFile()) return [path];
    // Symlinks and special files could hide records from this audit.
    throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: ${path} must be a plain file or directory`);
  }));
  return nested.flat();
}

/**
 * Lists every canonical component artifact and example record on disk.
 * The manifest stays the declared inventory; this only audits it.
 */
export async function canonicalComponentRecords(repositoryRoot) {
  const files = await walk(join(repositoryRoot, COMPONENTS_ROOT));
  return files
    .map((file) => relative(repositoryRoot, file).split(sep).join('/'))
    .filter((path) => {
      const [, , , ...rest] = path.split('/');
      return (rest.length === 1 && rest[0] === 'artifact.json')
        || (rest[0] === 'examples' && path.endsWith('.example.json'));
    })
    .sort();
}

/**
 * Fails when a canonical component or example record is neither listed in
 * the source manifest nor explicitly excluded with a reason, or when an
 * exclusion is stale (listed, absent on disk, or missing its reason).
 */
export async function assertManifestCompleteness({
  repositoryRoot,
  manifest,
  exclusions = MANIFEST_EXCLUSIONS,
}) {
  const listed = new Set(manifest.records.map(({ path }) => path));
  const onDisk = await canonicalComponentRecords(repositoryRoot);
  const present = new Set(onDisk);
  const stale = Object.entries(exclusions)
    .filter(([path, reason]) => (
      listed.has(path)
      || !present.has(path)
      || typeof reason !== 'string'
      || reason.trim().length === 0
    ))
    .map(([path]) => path)
    .sort();
  if (stale.length > 0) {
    throw new Error(
      `MUXUI_CATALOG_SOURCE_EXCLUSION_STALE: remove or fix these exclusions, which are listed, missing on disk, or lack a reason: ${stale.join(', ')}`,
    );
  }
  const unlisted = onDisk.filter((path) => !listed.has(path) && !(path in exclusions));
  if (unlisted.length > 0) {
    throw new Error(
      `MUXUI_CATALOG_SOURCE_UNLISTED: list these canonical records in the catalog source manifest or exclude them with a reason: ${unlisted.join(', ')}`,
    );
  }
}
