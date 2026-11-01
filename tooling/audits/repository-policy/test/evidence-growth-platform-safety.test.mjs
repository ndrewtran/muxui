import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseJsonStrict } from '../../../../packages/schema/src/index.mjs';
import { catalogAcrossCommit, legacyPlatformSafetyDefaults, normalizeLegacyPlatformSafety } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { compileBundle } from '../../../../tests/evidence/bl1/regression.mjs';
import { repositoryRoot } from './evidence-growth-repository.mjs';

// BL1 growth, E-BL1-08, across Decision 0031 item 10: a tree from before platform safety resolved from registry defaults declares a full set per
// binding and has a registry without `defaults`. These tests run over trees from the repository's real history (not a fixture built from HEAD), so
// they hold whatever the current compiler does to a legacy tree. The commit just before that change is the post-parking shape (unsupported bindings
// declare all not-applicable); the first retained growth commit is the pre-parking shape (web.html direct, and the React Native binding adapted
// with iOS and Android profiles).
const preChange = '6037b01a';
const requirementIds = ['system.forced-colors', 'system.high-contrast', 'native.dynamic-color', 'native.font-metrics', 'layout.direction', 'platform.accessibility-mapping'];

/** The tree of `revision` in a new temporary directory, `use` run on it, and the directory removed. */
async function withTree(revision, use) {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-platform-safety-tree-'));
  try {
    execFileSync('tar', ['-x', '-C', directory], { input: execFileSync('git', ['archive', '--format=tar', revision], { cwd: repositoryRoot, maxBuffer: 512 * 1024 * 1024 }), maxBuffer: 64 * 1024 * 1024 });
    return await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The (component, binding, profile, requirement, disposition) rows of every authored declaration in the tree at `directory`. */
async function authoredObligations(directory) {
  const rows = [];
  for (const slug of await readdir(join(directory, 'catalog/components'))) {
    const record = await readFile(join(directory, 'catalog/components', slug, 'artifact.json'), 'utf8').then(JSON.parse, () => undefined);
    for (const [bindingId, binding] of Object.entries(record?.bindings ?? {})) {
      for (const { profile, requirements } of binding.platformSafety ?? []) {
        for (const { id, disposition } of requirements) rows.push([slug, bindingId, profile, id, disposition].join('|'));
      }
    }
  }
  return rows.sort();
}

/** The same rows from the requirement sets a compile resolved. */
function compiledObligations(bundle) {
  return bundle.artifacts.filter(({ kind }) => kind === 'component').flatMap((artifact) => (
    Object.values(artifact.platformSafetyRequirementSets).flatMap((set) => (
      set.dispositions.map(({ id, disposition }) => [artifact.id.replace('muxui:component:', ''), set.bindingId, set.profile, id, disposition].join('|'))
    ))
  )).sort();
}

test('the tree just before the defaults is rejected as committed and compiles, with the obligations it declared, once normalized', async () => {
  await withTree(preChange, async (directory) => {
    const declared = await authoredObligations(directory);
    assert.equal(declared.length, 96 * requirementIds.length, 'every binding declares each requirement');
    // The current compiler reads each full declaration as an override, and the registry has no defaults to resolve it against.
    await assert.rejects(compileBundle(() => true, directory), (error) => error.issues?.some(({ path }) => path.includes('/platformSafety/')));
    await normalizeLegacyPlatformSafety(directory);
    const { bundle } = await compileBundle(() => true, directory);
    assert.deepEqual(compiledObligations(bundle), declared, 'every binding resolves to the dispositions it declared');
  });
});

test('E-BL1-08 across a retained pre-parking growth commit compiles both trees and holds', async () => {
  const [scope] = JSON.parse(await readFile(join(repositoryRoot, 'tests/evidence/bl1/artifacts/E-BL1-08.json'), 'utf8')).observations.growthScope.commits;
  const across = await catalogAcrossCommit({ cwd: repositoryRoot, commit: scope.commit, parent: scope.parent, excludedDirectories: scope.excludedDirectories, digestAffectingPathsChanged: scope.digestAffectingPathsChanged });
  assert.deepEqual([across.identical, across.holds], [true, true], 'the commit added only blocks, so the catalog without them is the same on both sides');
  // The post-parking shape: the tree just before the defaults, compared across two real commits.
  const acrossPreChange = await catalogAcrossCommit({ cwd: repositoryRoot, commit: preChange, parent: `${preChange}^`, excludedDirectories: [], digestAffectingPathsChanged: [] });
  assert.match(acrossPreChange.digestBefore, /^sha256:[0-9a-f]{64}$/u);
  assert.match(acrossPreChange.digestAfter, /^sha256:[0-9a-f]{64}$/u);
});

test('the legacy defaults are the dispositions the registry first carried as defaults', () => {
  const added = execFileSync('git', ['log', '--format=%H', '-S"defaults":', '--', 'strategy/platform-safety-contract.json'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().split('\n').at(-1);
  assert.ok(added, 'the registry has a commit that added its defaults');
  const contract = parseJsonStrict(execFileSync('git', ['show', `${added}:strategy/platform-safety-contract.json`], { cwd: repositoryRoot, encoding: 'utf8' }));
  const shape = (entries) => entries.map(({ id, disposition }) => [id, disposition]);
  const legacy = legacyPlatformSafetyDefaults(contract.requirements.map(({ id }) => id));
  assert.deepEqual(shape(legacy.profiles['web.react']), shape(contract.defaults.profiles['web.react']));
  assert.deepEqual(shape(legacy.unsupported), shape(contract.defaults.unsupported));
});

/** A small legacy tree: a registry without defaults and one component record whose bindings are `bindings`. */
async function withLegacyTree(bindings, use, { contract = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-platform-safety-fixture-'));
  try {
    await Promise.all(['packages/catalog', 'strategy', 'catalog/components/a'].map((path) => mkdir(join(directory, path), { recursive: true })));
    await writeFile(join(directory, 'packages/catalog/catalog-sources.json'), JSON.stringify({ platformSafetyContractPath: 'strategy/platform-safety-contract.json', records: [{ family: 'component', path: 'catalog/components/a/artifact.json' }] }));
    await writeFile(join(directory, 'strategy/platform-safety-contract.json'), JSON.stringify({ schema: 'muxui-platform-safety-contract-v1', contractVersion: '1.0.0', requirements: requirementIds.map((id) => ({ id, meaning: 'm', boundary: 'b' })), ...contract }));
    await writeFile(join(directory, 'catalog/components/a/artifact.json'), JSON.stringify({ id: 'muxui:component:a', kind: 'component', bindings }));
    return await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const declaration = (profile, dispositions) => ({ profile, requirements: requirementIds.map((id, index) => (dispositions[index] === 'r' ? { id, disposition: 'required' } : { id, disposition: 'not-applicable', reason: 'Because.' })) });
const web = ['r', 'r', 'n', 'n', 'r', 'r'];
const webBinding = (extra = {}) => ({ strategy: 'direct', runtimeProfiles: {}, platformSafety: [declaration('web.react', web)], ...extra });

test('normalization drops a declaration that is exactly the default and refuses any other', async () => {
  await withLegacyTree({ 'web.react': webBinding() }, async (directory) => {
    await normalizeLegacyPlatformSafety(directory);
    const record = parseJsonStrict(await readFile(join(directory, 'catalog/components/a/artifact.json'), 'utf8'));
    assert.equal(Object.hasOwn(record.bindings['web.react'], 'platformSafety'), false);
    const contract = parseJsonStrict(await readFile(join(directory, 'strategy/platform-safety-contract.json'), 'utf8'));
    assert.deepEqual(JSON.parse(JSON.stringify(contract.defaults)), legacyPlatformSafetyDefaults(requirementIds));
  });

  const refused = [
    ['a requirement that differs from the default', { 'web.react': webBinding({ platformSafety: [declaration('web.react', ['n', 'r', 'n', 'n', 'r', 'r'])] }) }, /web\.react states system\.forced-colors as not-applicable, where the default is required/u],
    ['a requirement that is missing', { 'web.react': webBinding({ platformSafety: [{ profile: 'web.react', requirements: declaration('web.react', web).requirements.slice(1) }] }) }, /does not declare each requirement once/u],
    ['a profile the binding does not have', { 'web.react': webBinding({ platformSafety: [declaration('web.react', web), declaration('web.html', web)] }) }, /declares web\.html, which it does not have/u],
    ['a profile of the binding that is not declared', { 'web.react': webBinding({ runtimeProfiles: { ios: { strategy: 'adapted' }, android: { strategy: 'adapted' } }, platformSafety: [declaration('ios', ['n', 'n', 'r', 'r', 'r', 'r'])] }) }, /misses the declaration of one of its profiles/u],
    ['an implemented profile the legacy defaults do not cover', { 'native.react-native': webBinding({ platformSafety: [declaration('native.react-native', web)] }) }, /native\.react-native has no legacy default/u],
    ['an unsupported binding that requires something', { 'web.html': { strategy: 'unsupported', platformSafety: [declaration('web.html', ['r', 'n', 'n', 'n', 'n', 'n'])] } }, /web\.html states system\.forced-colors as required, where the default is not-applicable/u],
  ];
  for (const [name, bindings, message] of refused) {
    await withLegacyTree(bindings, async (directory) => {
      await assert.rejects(normalizeLegacyPlatformSafety(directory), (error) => error.message.startsWith('BL1_LEGACY_PLATFORM_SAFETY: ') && message.test(error.message), `${name} is refused, not dropped`);
    });
  }

  // A registry that already carries defaults marks a current tree: nothing is dropped, so the compiler's strict override rules apply.
  await withLegacyTree({ 'web.react': webBinding() }, async (directory) => {
    const recordPath = join(directory, 'catalog/components/a/artifact.json');
    const before = await readFile(recordPath, 'utf8');
    await normalizeLegacyPlatformSafety(directory);
    assert.equal(await readFile(recordPath, 'utf8'), before);
  }, { contract: { defaults: legacyPlatformSafetyDefaults(requirementIds) } });
});
