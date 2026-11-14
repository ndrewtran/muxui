import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/canonical-json.mjs';
import {
  FIRST_RELEASE_VARIABLE,
  NEW_PACKAGES,
  PRIOR_RELEASE_VARIABLE,
  assertReleaseVersions,
  compareVersions,
  findCandidateSetProblems,
  findPriorManifestProblems,
  findVersionProblems,
  planReuse,
  resolvePriorRelease,
  reusedRecords,
} from '../src/release-effects.mjs';
import { PORTFOLIO_SCHEMA, releaseIdFor, sha256 } from '../src/release-manifest.mjs';
import { readPublishSet } from '../src/release-set.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const publishSet = readPublishSet(repositoryRoot);

// A prior portfolio manifest as the checks read it: package versions and roles, contract versions, and recorded edges,
// sealed with the release id and digest its content gives, as `buildPortfolioManifest` writes them.
const seal = (manifest) => {
  const published = manifest.packages.filter(({ role }) => role === 'published');
  const identified = { ...manifest, id: releaseIdFor({ revision: manifest.source.revision, published }) };
  const { digest: _digest, preparation: _preparation, ...body } = identified;
  return { ...identified, digest: sha256(canonicalJson(body)) };
};
const priorManifest = seal({
  schema: PORTFOLIO_SCHEMA,
  source: { revision: 'a'.repeat(40), tree: 'b'.repeat(40) },
  packages: [['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.1'], ['@muxui/react', '0.1.0-rc.5']].map(([name, version]) => ({ name, version, role: 'published' })),
  contracts: { schemaVersion: '3.0.0', queryApiVersion: '2.1.0', tokenContractVersion: '1.1.0' },
  compatibility: {
    edges: [
      { from: '@muxui/catalog', to: '@muxui/schema', range: '^0.6.0-rc.1', version: '0.6.0-rc.1' },
      { from: '@muxui/tooling', to: '@muxui/catalog', range: '^2.1.0-rc.1', version: '2.1.0-rc.1' },
      { from: '@muxui/tooling', to: '@muxui/schema', range: '^0.6.0-rc.1', version: '0.6.0-rc.1' },
    ],
  },
});
const variant = (change) => seal(change(structuredClone(priorManifest)));
const proposed = (changes = {}, manifest = priorManifest) => new Map([...manifest.packages.map(({ name, version }) => [name, version]), ...Object.entries(changes)]);
// The version check's codes for a release that proposes `changes` over the prior versions and reuses `reused`.
const problemCodes = ({ changes = {}, reused = [], manifest = priorManifest } = {}) => findVersionProblems({
  priorManifest: manifest,
  publishSet,
  versions: proposed(changes, manifest),
  reused: new Map(reused.map((name) => [name, manifest.packages.find((record) => record.name === name)])),
}).map(({ code }) => code);

test('versions order as node-semver orders them: rc.N by N, and every rc below its release', () => {
  const ordered = ['2.1.0-rc.1', '2.1.0-rc.2', '2.1.0-rc.10', '2.1.0', '2.1.1-rc.1', '2.2.0-rc.1', '3.0.0-rc.1'];
  for (const [index, version] of ordered.entries()) {
    for (const [other, against] of ordered.entries()) assert.equal(compareVersions(version, against), Math.sign(index - other), `${version} against ${against}`);
  }
  assert.throws(() => compareVersions('2.1', '2.1.0'), /P2_1_VERSION_UNSUPPORTED/u);
});

test('every published package moves ahead of the prior release, and a reused one stays', () => {
  const others = ['@muxui/schema', '@muxui/catalog', '@muxui/tooling'];
  assert.deepEqual(problemCodes({ changes: { '@muxui/react': '0.1.0-rc.6' }, reused: others }), []);
  // A higher base or a major move is the release's choice.
  assert.deepEqual(problemCodes({ changes: { '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.2.0-rc.1' }, reused: ['@muxui/schema', '@muxui/react'] }), []);
  // Backwards, or a published version that repeats the prior one, is refused.
  assert.deepEqual(problemCodes({ changes: { '@muxui/react': '0.1.0-rc.4' }, reused: others }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(problemCodes({ reused: others }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.equal(problemCodes({ changes: { '@muxui/schema': '0.5.0-rc.1' } }).includes('P2_1_VERSION_NOT_AHEAD'), true);
  assert.deepEqual(findVersionProblems({ priorManifest, publishSet, versions: new Map([['@muxui/react', '0.1.0-rc.6']]) }).map(({ code }) => code), ['P2_1_RELEASE_VERSIONS_INVALID']);
  const next = proposed({ '@muxui/schema': '0.6.0-rc.2', '@muxui/catalog': '2.1.0-rc.2', '@muxui/tooling': '1.1.0-rc.2', '@muxui/react': '0.1.0-rc.6' });
  assert.deepEqual(assertReleaseVersions({ priorManifest, publishSet, versions: next }), { status: 'checked', priorRelease: priorManifest.id, priorRevision: priorManifest.source.revision });
  assert.throws(() => assertReleaseVersions({ priorManifest, publishSet, versions: proposed() }), /P2_1_RELEASE_VERSIONS_REJECTED: @muxui\/schema repeats 0\.6\.0-rc\.1/u);
});

test('a reused package whose recorded range does not admit a sibling\'s new version must publish', () => {
  // A catalog major leaves tooling's recorded ^2.1.0-rc.1 behind, so tooling cannot be reused.
  assert.deepEqual(problemCodes({ changes: { '@muxui/catalog': '3.0.0-rc.1' }, reused: ['@muxui/schema', '@muxui/tooling', '@muxui/react'] }), ['P2_1_VERSION_RANGE_BROKEN']);
  assert.deepEqual(problemCodes({ changes: { '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.1.0-rc.2' }, reused: ['@muxui/schema', '@muxui/react'] }), []);
  // A new schema base breaks the catalog's range and both of tooling's.
  assert.deepEqual(problemCodes({ changes: { '@muxui/schema': '0.7.0-rc.1' }, reused: ['@muxui/catalog', '@muxui/tooling', '@muxui/react'] }), ['P2_1_VERSION_RANGE_BROKEN', 'P2_1_VERSION_RANGE_BROKEN']);
  // The same release against an inventory with no edges would have passed, which is why the inventory is checked first.
  const withoutEdges = variant((manifest) => { manifest.compatibility.edges = []; return manifest; });
  assert.deepEqual(problemCodes({ changes: { '@muxui/catalog': '3.0.0-rc.1' }, reused: ['@muxui/schema', '@muxui/tooling', '@muxui/react'], manifest: withoutEdges }), ['P2_1_PRIOR_RELEASE_INVALID']);
});

test('a prior manifest must inventory the whole publish set, or nothing is compared with it', () => {
  assert.deepEqual(findPriorManifestProblems(priorManifest, publishSet), []);
  // Arbitrary bumps pass against an empty or partial inventory unless the inventory itself is checked.
  const bumped = proposed({ '@muxui/react': '9.9.9-rc.1', '@muxui/catalog': '9.9.9-rc.1' });
  const unusable = (manifest, versions = bumped) => [...new Set(findVersionProblems({ priorManifest: manifest, publishSet, versions }).map(({ code }) => code))];
  assert.deepEqual(unusable(variant((manifest) => ({ ...manifest, packages: [] }))), ['P2_1_PRIOR_RELEASE_INVALID']);
  assert.deepEqual(unusable(variant((manifest) => ({ ...manifest, packages: manifest.packages.slice(0, 3) }))), ['P2_1_PRIOR_RELEASE_INVALID']);
  assert.deepEqual(unusable(variant((manifest) => ({ ...manifest, packages: [...manifest.packages].reverse() }))), ['P2_1_PRIOR_RELEASE_INVALID']);
  const problems = (change, sealed = true) => findPriorManifestProblems(sealed ? variant(change) : change(structuredClone(priorManifest)), publishSet).join('; ');
  assert.match(problems((manifest) => { manifest.packages[2].version = 'one'; return manifest; }), /@muxui\/tooling: "one" is not a semantic version/u);
  assert.match(problems((manifest) => { manifest.packages[0].role = 'adopted'; return manifest; }), /@muxui\/schema has role "adopted"/u);
  assert.match(problems((manifest) => { manifest.contracts.schemaVersion = '3'; return manifest; }), /contracts\.schemaVersion/u);
  assert.match(problems((manifest) => { manifest.source.revision = 'main'; return manifest; }), /no source commit/u);
  assert.match(problems((manifest) => { manifest.packages[1].version = '2.1.0-rc.9'; return manifest; }, false), /digest does not match/u);
  assert.match(problems((manifest) => { manifest.compatibility.edges[1].version = '2.1.0-rc.4'; return manifest; }), /records 2\.1\.0-rc\.4, not 2\.1\.0-rc\.1/u);
  assert.match(problems((manifest) => { manifest.compatibility.edges[1].range = '^2.2.0-rc.1'; return manifest; }), /does not admit 2\.1\.0-rc\.1/u);
  // The edges are the publish set's runtime edges, all of them and no other: a missing, partial, or extra inventory is refused.
  for (const change of [
    (manifest) => { manifest.compatibility.edges = []; },
    (manifest) => { delete manifest.compatibility; },
    (manifest) => { manifest.compatibility.edges.pop(); },
    (manifest) => { manifest.compatibility.edges.push({ from: '@muxui/react', to: '@muxui/schema', range: '^0.6.0-rc.1', version: '0.6.0-rc.1' }); },
  ]) {
    assert.match(problems((manifest) => { change(manifest); return manifest; }), /its edges are .*, not the publish set's runtime edges @muxui\/catalog > @muxui\/schema, @muxui\/tooling > @muxui\/catalog, @muxui\/tooling > @muxui\/schema/u);
  }
  // A digest that matches but a release id that names other versions.
  const { digest: _digest, ...forged } = { ...priorManifest, id: 'muxui-portfolio:forged' };
  assert.match(findPriorManifestProblems({ ...forged, digest: sha256(canonicalJson(forged)) }, publishSet).join('; '), /release id does not name/u);
  assert.throws(() => assertReleaseVersions({ priorManifest: variant((manifest) => ({ ...manifest, packages: [] })), publishSet, versions: bumped }), /P2_1_RELEASE_VERSIONS_REJECTED: the prior release manifest is unusable/u);
});

test('a portfolio schema version this tool does not read is refused wherever a prior manifest is read', () => {
  const next = variant((manifest) => ({ ...manifest, schema: 'muxui-portfolio-release-v2' }));
  assert.match(findPriorManifestProblems(next, publishSet).join('; '), /muxui-portfolio-release-v2 is an unknown portfolio release schema version/u);
  assert.match(findPriorManifestProblems({ ...priorManifest, schema: 'other' }, publishSet).join('; '), /it is not a muxui-portfolio-release-v1 document/u);
  assert.deepEqual(problemCodes({ manifest: next }), ['P2_1_PRIOR_RELEASE_INVALID']);
});

test('the installed candidate set is prereleases, the catalog version is catalogVersion, and tooling admits the catalog', () => {
  const versions = new Map([['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.1'], ['@muxui/react', '0.1.0-rc.5']]);
  const good = { versions, installed: new Map(versions), toolingCatalogRange: '^2.1.0-rc.1', catalogVersion: '2.1.0-rc.1' };
  assert.deepEqual(NEW_PACKAGES, ['@muxui/schema', '@muxui/catalog', '@muxui/tooling']);
  assert.deepEqual(findCandidateSetProblems(good), []);
  const problems = (change) => findCandidateSetProblems({ ...good, ...change });
  assert.match(problems({ installed: new Map([...versions, ['@muxui/schema', '0.6.0']]) })[0], /@muxui\/schema installs 0\.6\.0, not the candidate/u);
  const stable = new Map([...versions, ['@muxui/tooling', '1.1.0']]);
  assert.match(problems({ versions: stable, installed: stable })[0], /@muxui\/tooling@1\.1\.0 is not an rc prerelease/u);
  assert.match(problems({ catalogVersion: '2.1.0' })[0], /declares catalogVersion 2\.1\.0/u);
  // Under node-semver a plain range admits a prerelease only of its own base version.
  assert.match(problems({ toolingCatalogRange: '^2.1.0-rc.2' })[0], /does not admit 2\.1\.0-rc\.1/u);
  const next = new Map([...versions, ['@muxui/catalog', '2.2.0-rc.1']]);
  assert.match(problems({ versions: next, installed: next, catalogVersion: '2.2.0-rc.1' })[0], /does not admit 2\.2\.0-rc\.1/u);
});

// The records a release keeps for what it reuses, and the retained manifests that vouch for them.
test('a reuse takes its records from the prior release, which must exist, be usable, and have its origin retained', () => {
  const originId = 'muxui-portfolio:origin';
  const withProvenance = (manifest, releaseId = manifest.id, sourceCommit = manifest.source.revision) => seal({
    ...manifest, packages: manifest.packages.map((record) => ({ ...record, provenance: { kind: 'release-commit', releaseId, sourceCommit } })),
  });
  const prior = withProvenance(priorManifest);
  const names = ['@muxui/schema', '@muxui/catalog', '@muxui/react'];
  const published = new Map([['@muxui/tooling', '1.1.0-rc.2']]);
  const plan = (options = {}) => planReuse({ publishSet, published, priorRelease: { first: false, priorManifest: prior }, revision: 'f'.repeat(40), cwd: repositoryRoot, readRetained: () => new Map(), ...options });

  const { reused, versions, priorManifests } = plan();
  assert.deepEqual([...reused.keys()], names);
  assert.deepEqual(reused.get('@muxui/react'), prior.packages[3], 'the whole record: version, file, digests, and provenance');
  assert.deepEqual([...versions], [['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.2'], ['@muxui/react', '0.1.0-rc.5']]);
  assert.deepEqual([...priorManifests.keys()], [prior.id]);
  assert.deepEqual([...reusedRecords({ names: [], priorRelease: { first: true }, publishSet })], []);
  // Neither a first release, nor an unusable prior manifest, can be reused from.
  assert.throws(() => plan({ priorRelease: { first: true } }), /P2_1_REUSE_NEEDS_PRIOR_RELEASE: @muxui\/schema, @muxui\/catalog, @muxui\/react are reused, and the first portfolio release has no prior release/u);
  assert.throws(() => plan({ priorRelease: { first: false, priorManifest: { ...prior, packages: prior.packages.slice(0, 3) } } }), /P2_1_PRIOR_RELEASE_INVALID: the prior release manifest is unusable/u);
  // A package the prior release reused is vouched for by the manifest of the release that published it, retained in the repository.
  const second = withProvenance(priorManifest, originId, 'e'.repeat(40));
  assert.throws(() => plan({ priorRelease: { first: false, priorManifest: second } }), /P2_1_REUSE_ORIGIN_UNAVAILABLE: @muxui\/schema@0\.6\.0-rc\.1 was published by muxui-portfolio:origin, whose manifest is not in releases\/ at /u);
  const retained = new Map([[originId, { id: originId }]]);
  const chained = plan({ priorRelease: { first: false, priorManifest: second }, readRetained: ({ ids }) => new Map([...retained].filter(([id]) => ids.includes(id))) });
  assert.deepEqual([...chained.priorManifests.keys()].sort(), [originId, second.id].sort());
});

// A throwaway repository: `write` a file, `commit` everything.
function scratchRepository(scratch) {
  const write = (path, value) => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
  };
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: scratch, encoding: 'utf8' }).trim();
  const commit = () => {
    write('README.md', 'sources\n');
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'sources');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  return { commit, git, write };
}

test('a release names its prior release from the ledger, or declares the first and agrees with the tree', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const { commit, git, write } = scratchRepository(scratch);
    const clean = commit();
    const resolve = (environment, revision = clean) => resolvePriorRelease({ environment, revision, cwd: scratch });
    const refusal = (environment, revision) => {
      try {
        resolve(environment, revision);
      } catch (error) {
        return error.message;
      }
      return assert.fail('the release was accepted');
    };
    // Neither, both, or a flag that is not `true` is refused; an unset variable cannot skip the check.
    assert.match(refusal({}), /P2_1_PRIOR_RELEASE_REQUIRED: set MUXUI_PRIOR_RELEASE_MANIFEST .* or MUXUI_FIRST_PORTFOLIO_RELEASE=true/u);
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: '', [FIRST_RELEASE_VARIABLE]: '' }), /P2_1_PRIOR_RELEASE_REQUIRED/u);
    assert.match(refusal({ [FIRST_RELEASE_VARIABLE]: 'yes' }), /P2_1_PRIOR_RELEASE_REQUIRED: MUXUI_FIRST_PORTFOLIO_RELEASE must be true/u);
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: 'x.json', [FIRST_RELEASE_VARIABLE]: 'true' }), /P2_1_PRIOR_RELEASE_AMBIGUOUS/u);
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: join(scratch, 'missing.json') }), /P2_1_PRIOR_RELEASE_UNAVAILABLE/u);
    // The first release is declared, and holds while no portfolio manifest is tracked.
    assert.deepEqual(resolve({ [FIRST_RELEASE_VARIABLE]: 'true' }), { first: true });
    write('releases/notes.json', { schema: 'something-else' });
    git('add', '-A');
    git('commit', '-q', '-m', 'unrelated file');
    assert.deepEqual(resolve({ [FIRST_RELEASE_VARIABLE]: 'true' }, git('rev-parse', 'HEAD')), { first: true });
    const ledgerPath = `releases/${priorManifest.id.slice('muxui-portfolio:'.length)}.json`;
    write(ledgerPath, priorManifest);
    git('add', '-A');
    git('commit', '-q', '-m', 'a portfolio release in the ledger');
    const retained = git('rev-parse', 'HEAD');
    assert.match(refusal({ [FIRST_RELEASE_VARIABLE]: 'true' }, retained), new RegExp(`P2_1_FIRST_RELEASE_CONTRADICTED: .*${ledgerPath.replace(/[./]/gu, '\\$&')}`, 'u'));
    // A manifest is found by what it says, not where it lives, which schema version it names, or how it is spaced.
    const attacks = {
      'a manifest outside the ledger': ['release/portfolio.json', priorManifest],
      'a later schema version': ['tests/p2-1/next.json', { ...priorManifest, schema: 'muxui-portfolio-release-v2' }],
      'a newline after the schema key': ['docs/archive/old.json', `{\n  "schema":\n    "muxui-portfolio-release-v1",\n  "id": "x"\n}\n`],
    };
    for (const [what, [path, content]] of Object.entries(attacks)) {
      write(path, content);
      git('add', '-A');
      git('commit', '-q', '-m', what);
      const revision = git('rev-parse', 'HEAD');
      rmSync(join(scratch, path));
      assert.match(refusal({ [FIRST_RELEASE_VARIABLE]: 'true' }, revision), new RegExp(`P2_1_FIRST_RELEASE_CONTRADICTED: .*${path.replace(/[./]/gu, '\\$&')}`, 'u'), what);
    }
    // The prior manifest is read as committed in the ledger, from the path given (absolute or relative to the repository).
    const path = join(scratch, ledgerPath);
    assert.deepEqual(resolve({ [PRIOR_RELEASE_VARIABLE]: path }, retained), { first: false, priorManifest });
    assert.deepEqual(resolve({ [PRIOR_RELEASE_VARIABLE]: ledgerPath }, retained), { first: false, priorManifest });
    write(ledgerPath, { ...priorManifest, packages: [] });
    assert.deepEqual(resolve({ [PRIOR_RELEASE_VARIABLE]: path }, retained), { first: false, priorManifest }, 'an edit that is not committed is not read');
    // A ledger file must hold the manifest its name gives, and only a ledger path is read.
    write(ledgerPath, { ...priorManifest, id: `muxui-portfolio:${'0'.repeat(32)}` });
    git('add', '-A');
    git('commit', '-q', '-m', 'another release under this name');
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: path }, git('rev-parse', 'HEAD')), /P2_1_PRIOR_RELEASE_UNAVAILABLE: .* cannot be read from the release ledger \(P2_1_RELEASE_LEDGER_MISMATCH/u);
    write('release/portfolio.json', priorManifest);
    git('add', '-A');
    git('commit', '-q', '-m', 'a copy outside the ledger');
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: 'release/portfolio.json' }, git('rev-parse', 'HEAD')), /P2_1_RELEASE_LEDGER_PATH_INVALID/u);
    assert.match(refusal({ [PRIOR_RELEASE_VARIABLE]: join(tmpdir(), 'elsewhere.json') }, retained), /cannot be read from the release ledger/u, 'a path outside the repository');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
