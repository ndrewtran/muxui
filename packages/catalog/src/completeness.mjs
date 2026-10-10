import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Canonical component, pattern, or example records that stay out of the manifest on
// purpose. Keys are repository-relative record paths; values give the reason.
export const MANIFEST_EXCLUSIONS = Object.freeze({
  'catalog/components/select/examples/react/composition.example.json':
    'Its source declares two executable exports; the docs example contract requires exactly one.',
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    // Only the component root is required; the other roots may not exist yet.
    if (error.code === 'ENOENT') return [];
    throw error;
  });
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
 * The manifest family of a repository-relative path under `catalog/`, or null
 * when the path is not a canonical record (content sources, assets, projections).
 */
function recordFamily(path) {
  const [, root, ...rest] = path.split('/');
  if (!path.endsWith('.json')) return null;
  if (rest.length === 1) return { capabilities: 'capability', guides: 'guide', tokens: 'token-source' }[root] ?? null;
  const family = { components: 'component', patterns: 'pattern' }[root];
  if (!family) return null;
  if (rest.length === 2 && rest[1] === 'artifact.json') return family;
  return rest[1] === 'examples' && path.endsWith('.example.json') ? 'example' : null;
}

/**
 * Every canonical record under `catalog/`, as `{ family, path }` sorted by path:
 * capability, guide, and token-source records at the top of their roots, and a
 * component or pattern `artifact.json` plus the example records under its
 * `examples/`. Exclusions are removed; an exclusion that is missing on disk,
 * lacks a reason, or names a path the walk would not list fails as stale.
 */
export async function deriveSourceRecords(repositoryRoot, exclusions = MANIFEST_EXCLUSIONS) {
  const roots = ['capabilities', 'guides', 'tokens', 'components', 'patterns'];
  const files = (await Promise.all(roots.map((root) => walk(join(repositoryRoot, 'catalog', root))))).flat();
  const onDisk = files
    .map((file) => relative(repositoryRoot, file).split(sep).join('/'))
    .flatMap((path) => {
      const family = recordFamily(path);
      return family ? [{ family, path }] : [];
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const present = new Set(onDisk.map(({ path }) => path));
  const stale = Object.entries(exclusions)
    .filter(([path, reason]) => !present.has(path) || typeof reason !== 'string' || reason.trim().length === 0)
    .map(([path]) => path)
    .sort();
  if (stale.length > 0) {
    throw new Error(
      `MUXUI_CATALOG_SOURCE_EXCLUSION_STALE: remove or fix these exclusions, which are missing on disk or lack a reason: ${stale.join(', ')}`,
    );
  }
  return onDisk.filter(({ path }) => !(path in exclusions));
}

/**
 * The manifest records after syncing with disk: listed records that still exist
 * keep their place, and records new on disk follow in path order. The compiler
 * orders records by path, so the listed order is only a diff-stability choice.
 */
export async function syncSourceRecords(repositoryRoot, listed, exclusions = MANIFEST_EXCLUSIONS) {
  const derived = await deriveSourceRecords(repositoryRoot, exclusions);
  const familyOf = new Map(derived.map(({ family, path }) => [path, family]));
  const kept = listed
    .filter(({ path }) => familyOf.has(path))
    .map((entry) => ({ ...entry, family: familyOf.get(entry.path) }));
  const keptPaths = new Set(kept.map(({ path }) => path));
  return [...kept, ...derived.filter(({ path }) => !keptPaths.has(path))];
}
