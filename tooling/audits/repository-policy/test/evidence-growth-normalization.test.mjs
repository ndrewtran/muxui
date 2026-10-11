import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { catalogAcrossCommit } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { gitIn, growthRepository, jsonEdit } from './evidence-growth-repository.mjs';

// BL1 growth, E-BL1-08: a tree from before Decision 0028, before block categories were catalog data, or before they carried labels is
// normalized the same way on both sides of the comparison. Like `evidence-growth-catalog.test.mjs`, it compiles two full extracted trees
// per comparison, and `node --test` runs the two files in parallel.
test('trees from before the manifest key was removed or before category labels compile the way they did, and an unknown registry shape still fails', async () => {
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
    // Every category now carries an explicit label, so the older registry files are converted before compiling, with the label the docs derived from
    // each id then (the id with dashes as spaces, capitalised). The closed list injected into a tree without a registry, and the group-to-id-list file
    // that made categories catalog data, compile on both sides, and to the same digest as a labelled file that spells those labels out.
    const unregistered = await repo.modify(async (edit, root) => {
      await edit('packages/catalog/catalog-sources.json', jsonEdit(({ patternCategoriesPath: _registry, ...manifest }) => manifest));
      await rm(join(root, 'catalog/patterns/categories.json'));
    });
    await repo.edit('README.md', (text) => `${text}\nUnregistered.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree without a category registry (#106)');
    const unregisteredChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossUnregistered = await catalogAcrossCommit({ cwd, commit: unregisteredChild, parent: unregistered, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossUnregistered.identical, acrossUnregistered.holds], [true, true], 'trees from before categories were catalog data compile with the closed list');
    const registryPath = 'catalog/patterns/categories.json';
    const withRegistry = (change) => repo.modify((edit) => edit(registryPath, (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`));
    const derivedLabel = (id) => `${id.charAt(0).toUpperCase()}${id.replaceAll('-', ' ').slice(1)}`;
    const mapGroups = (registry, change) => Object.fromEntries(Object.entries(registry).map(([group, categories]) => [group, change(Object.keys(categories))]));
    const lists = await withRegistry((registry) => mapGroups(registry, (ids) => ids));
    const derived = await withRegistry((registry) => mapGroups(registry, (ids) => Object.fromEntries(ids.map((id) => [id, derivedLabel(id)]))));
    const sameDigest = async (commit, parent) => (await catalogAcrossCommit({ cwd, commit, parent, excludedDirectories: [], digestAffectingPathsChanged: [] })).identical;
    assert.equal(await sameDigest(lists, derived), true, 'a group-to-id-list registry compiles as the labelled file with capitalised ids');
    assert.equal(await sameDigest(unregistered, lists), true, 'the injected closed list is the same registry as the group-to-id-list file');
    assert.equal(await sameDigest(lists, second), false, 'the labels are derived, so a file with explicit labels such as "FAQ" differs');
    // Anything else is not converted, so the compiler still rejects it: a group that is not a list of ids, a list mixed with a labelled group, and a list the
    // old schema already refused.
    for (const [name, change] of [
      ['a group that is a string', (registry) => ({ ...registry, application: 'forms' })],
      ['a list beside a labelled group', (registry) => ({ ...registry, application: Object.keys(registry.application) })],
      ['a list with a repeated id', (registry) => mapGroups(registry, (ids) => [...ids, ids[0]])],
      ['a list with a non-string id', (registry) => mapGroups(registry, (ids) => [...ids, 7])],
    ]) {
      const unknownShape = await withRegistry(change);
      await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownShape, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'MUXUI_SCHEMA_INVALID', `${name} still fails the compiler`);
    }
    // The compiler parses these files strictly, so a repeated key is an error there. Normalization uses the same parser: `JSON.parse` would keep only the
    // last occurrence and the file would be rewritten as valid JSON, hiding the repeat. Each tree below is identical to its parent once the first occurrence is
    // discarded, so only a strict parse tells them apart.
    const duplicatedRegistry = await repo.modify((edit) => edit(registryPath, (text) => {
      const groups = Object.entries(mapGroups(JSON.parse(text), (ids) => ids)).map(([group, ids]) => `  ${JSON.stringify(group)}: ${JSON.stringify(ids)}`);
      return `{\n  "application": ["decoy"],\n${groups.join(',\n')}\n}\n`;
    }));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: duplicatedRegistry, parent: lists, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'JSON_DUPLICATE_KEY', 'a legacy registry with a repeated group is rejected, not normalized');
    const duplicatedKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', (text) => text.replace(/^\{\n/u, '{\n  "authorityDecisionPath": "decisions/old.md",\n  "authorityDecisionPath": "decisions/older.md",\n')));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: duplicatedKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'JSON_DUPLICATE_KEY', 'a manifest with the removed key twice is rejected, not normalized');
    const unknownKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ unexpectedKey: true })));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), /MUXUI_CATALOG_SOURCE_INVALID/u, 'any other unknown manifest key still fails');
  } finally {
    await repo.dispose();
  }
});
