import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { growthCommits } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { gitIn, growthRepository, jsonEdit, repositoryRoot, summaryEdit } from './evidence-growth-repository.mjs';

// BL1 growth: the commits that added or changed the new blocks are selected from git one at a time, each squash-merged, and audited
// against their first parents. The fixture is a throwaway repository of this checkout's tree (`evidence-growth-repository.mjs`).
test('growth commits are found one at a time from any head, and a pull request that is not one squash-merged commit is refused', async () => {
  const repo = await growthRepository();
  const { cwd, base, first, second, derive, failed, patternA, patternB, directoryA, directoryB } = repo;
  try {
    // Blocks that arrived in two commits are found one commit at a time, from a head that is later than both.
    gitIn(cwd, 'checkout', '-q', '--detach', second);
    await repo.edit('README.md', (text) => `${text}\nMore.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'an unrelated change after the growth');
    const later = gitIn(cwd, 'rev-parse', 'HEAD');
    const found = derive(later);
    assert.deepEqual(
      found.map(({ commit, parent, addedPatterns, changedPatterns, excludedDirectories, digestAffectingPathsChanged }) => [commit, parent, addedPatterns, changedPatterns, excludedDirectories, digestAffectingPathsChanged]),
      [[first, base, [patternA], [], [`${directoryA}/`], []], [second, first, [patternB], [], [`${directoryB}/`], []]],
    );
    assert.ok(found[1].excludedEntries.length > 0 && found[1].excludedEntries.every(({ path }) => path.startsWith(`${directoryB}/`)), 'the excluded sources are the ones the commit added');
    assert.throws(() => derive(later, ['muxui:pattern:missing']), /BL1_GROWTH_COMMIT_MISSING: muxui:pattern:missing is not a pattern/u);
    assert.throws(() => derive(later, [repo.earlier]), /BL1_GROWTH_COMMIT_MISSING: no commit after .* added or changed/u, 'a block no commit after the close-out touched is not growth');
    // Growth that only adds blocks passes every scoped check, whatever else the head holds.
    assert.deepEqual(failed([first, second]), []);

    // Git cannot say which commits belong to one pull request, so each growth pull request must be one squash-merged commit. A pull request
    // rebase-merged as several commits has a commit that touches no block (here a workflow): selection would never see it, and every scoped
    // check would pass without it. The selection refuses the pull request instead.
    const { block, workflow } = await repo.rebased();
    assert.throws(() => derive(workflow, [patternA]), /BL1_GROWTH_NOT_SQUASHED: .* \(feat\(catalog\): add the block\) adds or changes a block but is not a squash merge/u);
    // Without the rule the workflow commit escapes the selection and the scoped audit passes: the defect the rule closes.
    const escaped = growthCommits({ cwd, head: workflow, since: base, patternIds: [patternA], requireSquash: false }).map(({ commit }) => commit);
    assert.deepEqual(escaped, [block], 'the workflow commit is not a growth commit');
    assert.deepEqual(failed(escaped), [], 'and so no scoped check sees the workflow');
    assert.deepEqual(failed([block, workflow]), ['no-workflow-or-hosting-config'], 'while auditing the workflow commit does fail the check');
    // A merge commit is refused the same way.
    gitIn(cwd, 'checkout', '-q', '--detach', base);
    gitIn(cwd, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #7 from side', block);
    assert.throws(() => derive(gitIn(cwd, 'rev-parse', 'HEAD'), [patternA]), /BL1_GROWTH_NOT_SQUASHED: .* is a merge commit/u);

    // A later commit that only edits a new block is a growth commit too (the audit and digest tests hold what it changes).
    const edited = await repo.modify((edit) => edit(`${directoryB}/artifact.json`, summaryEdit));

    // Renames are not tracked: a commit that renames, moves, or deletes the directory or record of a block added since the close-out fails, whatever
    // the block is called at the head, because the two sides could not exclude it consistently and its earlier commits would go unaudited.
    const movedMessage = /BL1_GROWTH_BLOCK_MOVED: .* the growth block .*; rename or remove a growth block in a separate, non-growth change/u;
    const renamed = await repo.modify(async (edit, root) => {
      const target = join(dirname(directoryB), 'zz-renamed-block');
      await cp(join(root, directoryB), join(root, target), { recursive: true });
      await rm(join(root, directoryB), { recursive: true });
      await edit('packages/catalog/catalog-sources.json', (text) => text.replaceAll(`${directoryB}/`, `${target}/`));
    });
    assert.throws(() => derive(renamed), movedMessage, 'a growth block renamed after its addition');
    const deleted = await repo.modify(async (edit, root) => {
      await rm(join(root, directoryB), { recursive: true });
      await edit('packages/catalog/catalog-sources.json', jsonEdit((manifest) => ({ ...manifest, records: manifest.records.filter(({ path }) => !path.startsWith(`${directoryB}/`)) })));
    });
    assert.throws(() => derive(deleted, [patternA]), movedMessage, 'a growth block deleted after its addition');
    // Only the record's move counts: the other blocks, and later edits to an unmoved block, are untouched by this rule.
    assert.doesNotThrow(() => derive(edited));
  } finally {
    await repo.dispose();
  }
});

test('a growth commit that changes more than its blocks fails the check that reads it, and so does a later commit that edits a block', async () => {
  const repo = await growthRepository();
  const { cwd, first, second, patternB, directoryB, derive, failed, commitsOf } = repo;
  try {
    const reactSource = (await readdir(join(cwd, 'packages/react/src'))).find((name) => name.endsWith('.mjs'));
    // A later commit that only edits a new block is a growth commit too, audited with that block left out of both sides.
    const edited = await repo.modify((edit) => edit(`${directoryB}/artifact.json`, summaryEdit));
    const [, , editCommit] = derive(edited);
    assert.deepEqual([editCommit.commit, editCommit.parent, editCommit.addedPatterns, editCommit.changedPatterns], [edited, second, [], [patternB]]);
    assert.deepEqual(failed(commitsOf(edited)), []);
    // The add-then-modify escape: the same later commit also changes React source, a dependency, or a component record. Only the commits that first
    // added the blocks pass; every commit that touches them is audited, so the later one fails.
    for (const [label, extra, checks] of [
      ['@muxui/react source', (edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`), ['react-source-files']],
      ['the lockfile', (edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`), ['no-dependency-change']],
      ['a component record', (edit) => edit('catalog/components/button/artifact.json', summaryEdit), ['no-new-component-token-capability-or-platform']],
      ['a workflow', (edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`), ['no-workflow-or-hosting-config']],
    ]) {
      const head = await repo.modify(async (edit) => { await edit(`${directoryB}/artifact.json`, summaryEdit); await extra(edit); });
      assert.deepEqual(failed([first, second]), [], `${label}: the commits that added the blocks alone are clean`);
      assert.deepEqual(failed(commitsOf(head)), checks, `${label}: a later commit that edits a new block and also changes it fails`);
    }

    // A growth commit that also changes @muxui/react source, its package.json, the lockfile, or a component record fails the check that reads it.
    const withSource = await repo.variant((edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`));
    assert.deepEqual(failed([first, withSource]), ['react-source-files']);
    const withManifest = await repo.variant((edit) => edit('packages/react/package.json', jsonEdit((manifest) => ({ ...manifest, version: `${manifest.version}+bumped` }))));
    assert.deepEqual(failed([first, withManifest]), ['react-package-manifest', 'react-source-files', 'versions-follow-decision-0026']);
    const withLockfile = await repo.variant((edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withLockfile]), ['no-dependency-change']);
    const withRecord = await repo.variant((edit) => edit('catalog/components/button/artifact.json', summaryEdit));
    assert.deepEqual(failed([first, withRecord]), ['no-new-component-token-capability-or-platform']);
    const withWorkflow = await repo.variant((edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withWorkflow]), ['no-workflow-or-hosting-config']);
    // Only the commit that changed more is blamed: the clean one alone still passes.
    assert.deepEqual(failed([first]), []);

    // An edit to a close-out block is not one of the new blocks, so it is never left out of either side (the digest test holds the other half).
    const withCloseoutBlock = await repo.variant((edit) => edit(`${dirname(repo.records[0].path)}/artifact.json`, summaryEdit));
    assert.deepEqual(failed([first, withCloseoutBlock]), [], 'an edit to a close-out block is outside the E-BL1-09 record checks');
    const [, closeoutBlockCommit] = derive(withCloseoutBlock);
    assert.ok(!closeoutBlockCommit.excludedDirectories.some((directory) => directory.startsWith(dirname(repo.records[0].path))), 'a close-out block is not left out of either side, so its edit moves the digest');
  } finally {
    await repo.dispose();
  }
});

// The fixture archives HEAD without `tests/evidence/`, so the tests above stand for this repository only while it is that tree.
test('the growth fixture is this checkout\'s HEAD tree without the retained evidence', async () => {
  const repo = await growthRepository();
  try {
    const files = (cwd, revision) => execFileSync('git', ['ls-tree', '-r', '-z', revision], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean);
    const expected = files(repositoryRoot, 'HEAD').filter((entry) => !entry.split('\t')[1].startsWith('tests/evidence/'));
    assert.ok(expected.length > 1000, 'the repository tree is listed');
    assert.deepEqual(files(repo.cwd, repo.second), expected);
  } finally {
    await repo.dispose();
  }
});

test('an informational growth gate records what a growth commit changed in @muxui/react, dependencies, and component records, and still fails a workflow, a version bump, or a platform', async () => {
  const { auditBoundary, growthInformationalLegs } = await import('../../../../tests/evidence/bl1/boundary-audit.mjs');
  const repo = await growthRepository();
  const { cwd, base, first, second, directoryB, audit, failed } = repo;
  try {
    const reactSource = (await readdir(join(cwd, 'packages/react/src'))).find((name) => name.endsWith('.mjs'));
    // Every check that reads @muxui/react, dependencies, and component records has legs that are recorded and do not gate; the gates are the rest.
    assert.deepEqual(Object.keys(growthInformationalLegs), ['react-package-manifest', 'react-source-files', 'react-stylesheet-names', 'no-dependency-change', 'no-new-component-token-capability-or-platform']);
    assert.deepEqual(growthInformationalLegs['no-new-component-token-capability-or-platform'], ['catalogRecordsUnchanged'], 'web.react-only stays a gate');
    for (const gate of ['no-workflow-or-hosting-config', 'versions-follow-decision-0026']) assert.equal(growthInformationalLegs[gate], undefined, `${gate} gates every leg`);

    // Computed from the checkout's own version, so the bump changes it whatever release candidate HEAD is at.
    const bumpVersion = jsonEdit((manifest) => ({ ...manifest, version: `${manifest.version}+bumped` }));
    for (const [label, change, checks] of [
      ['@muxui/react source', (edit) => edit(`packages/react/src/${reactSource}`, (text) => `${text}\n// changed\n`), ['react-source-files']],
      ['the lockfile', (edit) => edit('pnpm-lock.yaml', (text) => `${text}\n# changed\n`), ['no-dependency-change']],
      ['a component record', (edit) => edit('catalog/components/button/artifact.json', jsonEdit((record) => ({ ...record, summary: `${record.summary} Edited.` }))), ['no-new-component-token-capability-or-platform']],
    ]) {
      const commit = await repo.variant(change);
      assert.deepEqual(failed([first, commit]), checks, `${label}: a strict audit fails the commit, as every capture made before Decision 0029 did`);
      const recorded = audit([first, commit], 'informational');
      assert.equal(recorded.pass, true, `${label}: the informational audit passes`);
      assert.deepEqual(recorded.growthScope.informationalLegs, growthInformationalLegs);
      const check = recorded.checks.find(({ id }) => id === checks[0]);
      assert.equal(Object.values(check.legs).includes(false), true, `${label}: the leg is still computed and recorded as failing`);
      assert.deepEqual(check.informationalLegs, growthInformationalLegs[checks[0]]);
      assert.equal(check.observations.commits.length, 2, `${label}: the per-commit list is recorded`);
      assert.match(check.claim, /claims nothing about/u, `${label}: the claim says it claims nothing`);
    }

    // What stays a gate fails a growth commit whatever the gate: a workflow, a hosting file, a version bump, and a platform other than web.react.
    const withWorkflow = await repo.variant((edit) => edit('.github/workflows/ci.yml', (text) => `${text}\n# changed\n`));
    assert.deepEqual(failed([first, withWorkflow], 'informational'), ['no-workflow-or-hosting-config'], 'a growth commit that changes a workflow still fails');
    const withHosting = await repo.variant(() => writeFile(join(cwd, 'netlify.toml'), '[build]\n'));
    assert.deepEqual(failed([first, withHosting], 'informational'), ['no-workflow-or-hosting-config']);
    const withVersion = await repo.variant((edit) => edit('packages/react/package.json', bumpVersion));
    assert.deepEqual(failed([first, withVersion], 'informational'), ['versions-follow-decision-0026'], 'a growth commit that bumps a version fails, and the manifest leg it also changes is recorded');
    const withCatalogVersion = await repo.variant((edit) => edit('packages/catalog/package.json', bumpVersion));
    assert.ok(failed([first, withCatalogVersion], 'informational').includes('versions-follow-decision-0026'), 'the three packages Decision 0026 named may not be bumped by a growth commit either');
    const withPlatform = await repo.variant((edit) => edit(`${directoryB}/artifact.json`, jsonEdit((record) => ({ ...record, platforms: [...record.platforms, 'web.html'] }))));
    assert.deepEqual(failed([first, withPlatform], 'informational'), ['no-new-component-token-capability-or-platform'], 'web.react-only stays a gate');

    // A later release candidate is not a growth commit: it bumps @muxui/react after the growth, and the range from the base blames the growth for it.
    const later = await repo.modify((edit) => edit('packages/react/package.json', bumpVersion));
    const versionsOver = (growthCommits) => auditBoundary({ cwd, base, head: later, mergeRevision: base, closeoutBase: null, growthCommits, offline: true, only: ['versions-follow-decision-0026'] }).pass;
    assert.equal(versionsOver(undefined), false, 'the range from the base fails after a later release candidate');
    assert.equal(versionsOver([first, second]), true, 'the growth commits do not');
    assert.throws(() => audit([first], 'sideways'), /BL1_AUDIT_GROWTH_GATE: unknown growth gate/u);
    assert.throws(() => auditBoundary({ cwd, base, head: first, closeoutBase: null, offline: true, growthGate: 'informational' }), /a growth gate needs growth commits/u);
  } finally {
    await repo.dispose();
  }
});
