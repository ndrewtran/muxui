import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { catalogAcrossCommit } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { gitIn, growthRepository, jsonEdit } from './evidence-growth-repository.mjs';

// BL1 growth, E-BL1-08: a tree from before Decision 0028 is normalized the same way on both sides of the comparison. Like
// `evidence-growth-catalog.test.mjs`, it compiles two full extracted trees per comparison, and `node --test` runs the two files in
// parallel.
test('trees from before the manifest key was removed compile the way they did, and a tree without category labels is refused', async () => {
  const repo = await growthRepository();
  const { cwd, second } = repo;
  try {
    // Decision 0028 removed `authorityDecisionPath` from the source manifest and the compiler rejects it, so trees from before then compile with that one key
    // dropped, on both sides. It is not an escape hatch: any other unknown manifest key still fails the compiler.
    const manifestEdit = (change) => jsonEdit((manifest) => ({ ...manifest, ...change }));
    const legacy = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ authorityDecisionPath: 'decisions/0017-text-family-admission.md' })));
    await repo.edit('README.md', (text) => `${text}\nLegacy.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree with the legacy manifest key (#105)');
    const legacyChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossLegacy = await catalogAcrossCommit({ cwd, commit: legacyChild, parent: legacy, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossLegacy.identical, acrossLegacy.holds], [true, true], 'trees that carry the removed manifest key compile on both sides');
    const acrossAdded = await catalogAcrossCommit({ cwd, commit: legacy, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossAdded.identical, acrossAdded.holds], [true, true], 'the key is dropped from the tree that carries it, and the one that does not is unchanged');
    // Every category now carries an explicit label (schema 3.0.0, Decision 0016: the current product reads current contracts only). The closed list of ids
    // that `normalizeLegacyManifest` injects into a tree without a registry has no labels, so the compiler refuses it. A growth capture over a tree from
    // before the labels needs that tool, under tests/evidence/bl1/growth-scope.mjs, to inject and convert registries with labels; this pins the gap.
    const unregistered = await repo.modify(async (edit, root) => {
      await edit('packages/catalog/catalog-sources.json', jsonEdit(({ patternCategoriesPath: _registry, ...manifest }) => manifest));
      await rm(join(root, 'catalog/patterns/categories.json'));
    });
    await repo.edit('README.md', (text) => `${text}\nUnregistered.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree without a category registry (#106)');
    const unregisteredChild = gitIn(cwd, 'rev-parse', 'HEAD');
    await assert.rejects(
      catalogAcrossCommit({ cwd, commit: unregisteredChild, parent: unregistered, excludedDirectories: [], digestAffectingPathsChanged: [] }),
      (error) => error.code === 'MUXUI_SCHEMA_INVALID' && /\$\/application must be object/u.test(error.message),
      'the closed list of category ids has no labels and is refused',
    );
    const unknownKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ unexpectedKey: true })));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), /MUXUI_CATALOG_SOURCE_INVALID/u, 'any other unknown manifest key still fails');
  } finally {
    await repo.dispose();
  }
});
