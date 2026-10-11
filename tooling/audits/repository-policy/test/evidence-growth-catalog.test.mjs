import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogAcrossCommit } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { growthRepository, jsonEdit, summaryEdit } from './evidence-growth-repository.mjs';

// BL1 growth, E-BL1-08: the catalog is compiled on both sides of each growth commit with the sources of the blocks it added or changed left
// out. Each comparison compiles two full extracted trees, so this file and `evidence-growth-normalization.test.mjs` are the slow half of the
// growth audit, and `node --test` runs them as separate files in parallel.
test('the catalog without the sources a growth commit adds or changes has one digest on both sides, and any other change moves it or fails the commit', async () => {
  const repo = await growthRepository();
  const { cwd, second, directoryB, derive } = repo;
  try {
    const [, added] = derive(second);
    const clean = await catalogAcrossCommit({ cwd, ...added });
    assert.deepEqual([clean.identical, clean.holds], [true, true], 'the catalog without the sources the commit added is the same before and after');

    // A later commit that only edits a new block is a growth commit too, audited with that block left out of both sides.
    const edited = await repo.modify((edit) => edit(`${directoryB}/artifact.json`, summaryEdit));
    const [, , editCommit] = derive(edited);
    assert.deepEqual([(await catalogAcrossCommit({ cwd, ...editCommit })).holds], [true], 'the edited block is left out of both sides');

    // A growth commit that changes the catalog without the sources of its blocks moves the digest: a component record, or a close-out block, which is
    // not one of the new blocks and so is never left out of either side.
    const withRecord = await repo.variant((edit) => edit('catalog/components/button/artifact.json', summaryEdit));
    const [, recordCommit] = derive(withRecord);
    const recordCatalog = await catalogAcrossCommit({ cwd, ...recordCommit });
    assert.deepEqual([recordCatalog.identical, recordCatalog.holds], [false, false], 'a changed component record moves the digest');

    // A growth commit that changes a compiler or schema path fails even though the one-compiler digest comparison cannot see it.
    // The copy is this checkout's HEAD, so bump whatever SCHEMA_VERSION it holds, and fail loudly if the edit finds nothing to change.
    const bumpSchemaVersion = (text) => {
      const bumped = text.replace(/(SCHEMA_VERSION = '\d+\.\d+\.)(\d+)'/u, (_, head, patch) => `${head}${Number(patch) + 1}'`);
      assert.notEqual(bumped, text, 'the schema source edit must change packages/schema/src/index.mjs');
      return bumped;
    };
    const withSchema = await repo.variant((edit) => edit('packages/schema/src/index.mjs', bumpSchemaVersion));
    const [, schemaCommit] = derive(withSchema);
    assert.deepEqual(schemaCommit.digestAffectingPathsChanged, ['packages/schema/src/index.mjs']);
    const schemaCatalog = await catalogAcrossCommit({ cwd, ...schemaCommit });
    assert.deepEqual([schemaCatalog.identical, schemaCatalog.holds], [true, false], 'the same compiler compiles both sides, so only the changed path fails the commit');
    // Export resolution decides which module the compiler loads, so redirecting a package's exports fails like changing the module: the
    // same compiler compiles both sides and the digest cannot show it. A growth pull request never touches these files.
    const redirect = (name) => repo.variant((edit) => edit(`packages/${name}/package.json`, jsonEdit((manifest) => ({ ...manifest, exports: { ...manifest.exports, '.': './src/elsewhere.mjs' } }))));
    const [, redirectCommit] = derive(await redirect('schema'));
    assert.deepEqual(redirectCommit.digestAffectingPathsChanged, ['packages/schema/package.json']);
    const redirected = await catalogAcrossCommit({ cwd, ...redirectCommit });
    assert.deepEqual([redirected.identical, redirected.holds], [true, false], 'a redirected schema export leaves the digest alone and fails the commit');
    for (const name of ['tokens', 'catalog']) assert.deepEqual(derive(await redirect(name))[1].digestAffectingPathsChanged, [`packages/${name}/package.json`], `a redirected ${name} export is a digest-affecting change`);
    // A commit that changes only a pattern validator, which writes nothing to the compiled output, is not held to the compiler paths.
    const withValidator = await repo.variant((edit) => edit('packages/catalog/src/pattern-content.mjs', (text) => `${text}\n// changed\n`));
    assert.deepEqual(derive(withValidator)[1].digestAffectingPathsChanged, []);
  } finally {
    await repo.dispose();
  }
});
