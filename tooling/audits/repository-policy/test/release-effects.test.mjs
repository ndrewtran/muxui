import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { validateFamily } from '@muxui/schema';
import { canonicalJson } from '../src/canonical-json.mjs';
import {
  FIRST_RELEASE_VARIABLE,
  GENERATION_INPUTS,
  NEW_PACKAGES,
  PRIOR_RELEASE_VARIABLE,
  assertVersionEffects,
  classifyReleaseEffects,
  compareVersions,
  findCandidateSetProblems,
  findPriorManifestProblems,
  findVersionEffectProblems,
  movedEffect,
  planReuse,
  readCommittedSide,
  resolvePriorRelease,
  reusedRecords,
} from '../src/release-effects.mjs';
import { PORTFOLIO_SCHEMA, caretAllows, releaseIdFor, sha256 } from '../src/release-manifest.mjs';
import { readPublishSet } from '../src/release-set.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixtureDirectory = join(import.meta.dirname, 'fixtures/version-effects');
const publishSet = readPublishSet(repositoryRoot);
const packageNames = publishSet.packages.map(({ name }) => name);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const base = readJson(join(fixtureDirectory, 'base.json'));

// A case edits the base with JSON Patch operations (add, replace, remove). A record is addressed by its id.
function resolveSegments(root, path) {
  return path.split('/').slice(1).map((segment, index, segments) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (segments[index - 1] === 'records' && index === 1 && Number.isNaN(Number(key)) && key !== '-') {
      const found = root.records.findIndex(({ record }) => record.id === key);
      assert.notEqual(found, -1, `no record ${key}`);
      return String(found);
    }
    return key;
  });
}

function applyPatch(root, operations) {
  const result = structuredClone(root);
  for (const { op, path, value } of operations) {
    const segments = resolveSegments(result, path);
    const last = segments.pop();
    const parent = segments.reduce((node, segment) => node[segment], result);
    if (op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(last), 1);
      else delete parent[last];
    } else if (Array.isArray(parent) && op === 'add') {
      parent.splice(last === '-' ? parent.length : Number(last), 0, value);
    } else {
      assert.ok(op === 'add' || (op === 'replace' && last in parent), `${op} ${path}`);
      parent[last] = value;
    }
  }
  return result;
}

const cases = readdirSync(fixtureDirectory).filter((name) => /^\d\d-.+\.json$/u.test(name)).sort()
  .map((name) => ({ name: name.replace(/\.json$/u, ''), ...readJson(join(fixtureDirectory, name)) }));

// The E-P2.1-04 SemVer classification corpus: one case per Architecture row that applies, with the effect on every unit.
for (const { name, row, priorPatch = [], patch = [], renderers, expect } of cases) {
  test(`version effects: ${name}`, () => {
    const current = applyPatch(base, patch);
    for (const { family, record } of current.records) validateFamily(family, record);
    const effects = classifyReleaseEffects({ prior: applyPatch(base, priorPatch), current, packageNames, ...(renderers === undefined ? {} : { renderers }) });
    assert.deepEqual(
      { catalog: effects.units.catalog, tokenContract: effects.units.tokenContract, schema: effects.units.schema, queryApi: effects.units.queryApi, renderers: effects.units.renderers, publish: effects.publish, problems: effects.problems.length },
      { catalog: 'none', tokenContract: 'none', schema: 'none', queryApi: 'none', renderers: { '@muxui/react': 'none' }, publish: [], problems: 0, ...expect },
      `${row}: ${effects.reasons.join('; ')}`,
    );
  });
}

test('the corpus asks for every effect level of the catalog and of a renderer', () => {
  assert.equal(new Set(cases.map(({ name }) => name)).size, cases.length);
  const levels = (read) => new Set(cases.map(({ expect }) => read(expect) ?? 'none'));
  assert.deepEqual([...levels(({ catalog }) => catalog)].sort(), ['major', 'minor', 'none', 'patch']);
  assert.deepEqual([...levels(({ renderers }) => renderers?.['@muxui/react'])].sort(), ['major', 'minor', 'none', 'patch']);
});

// Only an annotation (patch) and an optional property under `properties` (minor) have a rule; any other schema edit is major.
test('a schema edit with no precise rule is major', () => {
  const component = '/schemas/component.schema.json';
  const edits = {
    additionalProperties: [{ op: 'add', path: `${component}/additionalProperties`, value: false }],
    propertyNames: [{ op: 'add', path: `${component}/propertyNames`, value: { pattern: '^[a-z]' } }],
    dependentSchemas: [{ op: 'add', path: `${component}/dependentSchemas`, value: { summary: { required: ['id'] } } }],
    'a constraint keyword': [{ op: 'replace', path: `${component}/properties/summary/minLength`, value: 5 }],
    'a property type': [{ op: 'replace', path: `${component}/properties/id/type`, value: 'number' }],
    'a removed definition': [{ op: 'remove', path: `${component}/$defs/valueOrAlias` }],
  };
  for (const [what, patch] of Object.entries(edits)) {
    const effects = classifyReleaseEffects({ prior: base, current: applyPatch(base, patch), packageNames });
    assert.equal(effects.units.schema, 'major', `${what}: ${effects.reasons.join('; ')}`);
    assert.equal(effects.units.queryApi, 'major', what);
  }
});

test('the first portfolio release has no prior and publishes every package', () => {
  const effects = classifyReleaseEffects({ prior: null, current: base, packageNames });
  assert.equal(effects.first, true);
  assert.equal(effects.units, null);
  assert.deepEqual(effects.publish, packageNames);
});

test('a move counts by base from the stable release, and a pre-1.0 minor bump claims major', () => {
  const moves = [
    ['2.1.0', '2.1.0-rc.4', 'none'],
    ['2.1.0', '2.1.1-rc.1', 'patch'],
    ['2.1.0', '2.2.0-rc.1', 'minor'],
    ['2.1.0', '3.0.0-rc.1', 'major'],
    ['0.1.0', '0.1.1-rc.1', 'minor'],
    ['0.1.0', '0.2.0-rc.1', 'major'],
    ['0.6.0', '1.0.0-rc.1', 'major'],
  ];
  for (const [stable, next, effect] of moves) assert.equal(movedEffect(stable, next), effect, `${stable} to ${next}`);
  assert.throws(() => movedEffect('2.1.0', '2.0.9-rc.1'), /P2_1_VERSION_NOT_AHEAD/u);
  assert.throws(() => movedEffect('2.1', '2.1.0'), /P2_1_VERSION_UNSUPPORTED/u);
  // Versions order as node-semver orders them: rc.N by N, and every rc below its release.
  const ordered = ['2.1.0-rc.1', '2.1.0-rc.2', '2.1.0-rc.10', '2.1.0', '2.1.1-rc.1', '2.2.0-rc.1', '3.0.0-rc.1'];
  for (const [index, version] of ordered.entries()) {
    for (const [other, against] of ordered.entries()) assert.equal(compareVersions(version, against), Math.sign(index - other), `${version} against ${against}`);
  }
});

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
const effectsOf = (units, publish = []) => ({ first: false, units: { catalog: 'none', tokenContract: 'none', schema: 'none', queryApi: 'none', renderers: { '@muxui/react': 'none' }, ...units }, publish, reasons: [] });
const problemCodes = ({ units, publish, versions = proposed(), contracts = {}, manifest = priorManifest, stable }) => findVersionEffectProblems({
  effects: effectsOf(units, publish),
  priorManifest: manifest,
  publishSet,
  versions,
  contracts: { ...priorManifest.contracts, ...contracts },
  stable,
}).map(({ code }) => code);
// A release of other versions: each recorded edge keeps the caret range its target's version gives, as a release derives it.
const releasedAs = (versions) => variant((manifest) => {
  for (const entry of manifest.packages) entry.version = versions[entry.name] ?? entry.version;
  for (const edge of manifest.compatibility.edges) {
    edge.version = versions[edge.to] ?? edge.version;
    edge.range = `^${edge.version}`;
  }
  return manifest;
});
// A prior release whose catalog and React are stable, so the next release is judged against them.
const stableManifest = releasedAs({ '@muxui/catalog': '2.1.0', '@muxui/react': '0.1.0' });

test('with no stable release, a unit\'s rc series admits any change but must move forward', () => {
  assert.deepEqual(problemCodes({}), []);
  // React 0.1.0-rc.5 to rc.6 for an implementation fix, and the catalog's next rc for an incompatible change (tooling's `^2.1.0-rc.1` admits it).
  assert.deepEqual(problemCodes({ units: { renderers: { '@muxui/react': 'patch' } }, publish: ['@muxui/react'], versions: proposed({ '@muxui/react': '0.1.0-rc.6' }) }), []);
  assert.deepEqual(problemCodes({ units: { catalog: 'major' }, publish: ['@muxui/catalog'], versions: proposed({ '@muxui/catalog': '2.1.0-rc.2' }) }), []);
  assert.deepEqual(problemCodes({ units: { catalog: 'major' }, publish: ['@muxui/catalog'], versions: proposed({ '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.2.0-rc.1' }) }), []);
  // Backwards or repeated is rejected, and so is releasing a unit that did not change.
  const react = { units: { renderers: { '@muxui/react': 'patch' } }, publish: ['@muxui/react'] };
  assert.deepEqual(problemCodes({ ...react, versions: proposed({ '@muxui/react': '0.1.0-rc.4' }) }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(problemCodes({ ...react, versions: proposed({ '@muxui/react': '0.1.0-rc.5' }) }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(problemCodes({ versions: proposed({ '@muxui/react': '0.1.0-rc.6' }) }), ['P2_1_VERSION_UNIT_UNCHANGED']);
});

test('every publishing package moves forward, not only a unit', () => {
  // Tooling and the schema package have no unit effect, so only direction checks them.
  const tooling = (publish, version) => problemCodes({ publish, versions: proposed({ '@muxui/tooling': version }) });
  assert.deepEqual(tooling(['@muxui/tooling'], '1.1.0-rc.2'), []);
  assert.deepEqual(tooling(['@muxui/tooling'], '1.1.0-rc.1'), ['P2_1_VERSION_PUBLICATION_MISSING']);
  assert.deepEqual(tooling(['@muxui/tooling'], '1.0.9-rc.3'), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(tooling([], '1.0.9-rc.3'), ['P2_1_VERSION_NOT_AHEAD']);
  const later = releasedAs({ '@muxui/tooling': '1.1.0-rc.2' });
  assert.deepEqual(problemCodes({ publish: ['@muxui/tooling'], manifest: later, versions: proposed({ '@muxui/tooling': '1.1.0-rc.1' }, later) }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(problemCodes({ publish: ['@muxui/schema'], versions: proposed({ '@muxui/schema': '0.5.0-rc.1' }) }).includes('P2_1_VERSION_NOT_AHEAD'), true);
});

test('after a stable release, a version must carry the effect of the change from that release', () => {
  // A catalog version outside tooling's recorded range forces tooling to republish alongside (see the forced-publication test).
  const catalog = (effect, version, { manifest = stableManifest, stable } = {}) => {
    const { range } = manifest.compatibility.edges.find(({ from, to }) => from === '@muxui/tooling' && to === '@muxui/catalog');
    const tooling = caretAllows(range, version) ? {} : { '@muxui/tooling': '1.1.0-rc.2' };
    return problemCodes({ units: { catalog: effect }, publish: ['@muxui/catalog'], manifest, versions: proposed({ '@muxui/catalog': version, ...tooling }, manifest), stable });
  };
  // The stable 2.1.0 followed by 2.1.1-rc.1 carries a patch at most.
  assert.deepEqual(catalog('major', '2.1.1-rc.1'), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(catalog('minor', '2.1.1-rc.1'), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(catalog('patch', '2.1.1-rc.1'), []);
  assert.deepEqual(catalog('minor', '2.2.0-rc.1'), []);
  assert.deepEqual(catalog('major', '2.2.0-rc.1'), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(catalog('major', '3.0.0-rc.1'), []);
  // An rc of the stable base carries nothing, and no rc is ahead of its own release.
  assert.deepEqual(catalog('patch', '2.1.0-rc.2'), ['P2_1_VERSION_NOT_AHEAD']);
  // A prior rc after the stable release is judged from the stable release the caller names.
  const prerelease = {
    manifest: releasedAs({ '@muxui/catalog': '2.2.0-rc.1', '@muxui/react': '0.1.0' }),
    stable: new Map([['@muxui/catalog', '2.1.0']]),
  };
  assert.deepEqual(catalog('minor', '2.2.0-rc.2', prerelease), []);
  assert.deepEqual(catalog('major', '2.2.0-rc.2', prerelease), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(catalog('major', '3.0.0-rc.1', prerelease), []);
  // Before 1.0 a patch bump claims a minor change and a minor bump a major one.
  const react = (effect, version) => problemCodes({ units: { renderers: { '@muxui/react': effect } }, publish: ['@muxui/react'], manifest: stableManifest, versions: proposed({ '@muxui/react': version }, stableManifest) });
  assert.deepEqual(react('minor', '0.1.1-rc.1'), []);
  assert.deepEqual(react('major', '0.1.1-rc.1'), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(react('major', '0.2.0-rc.1'), []);
});

test('a package that must publish takes a new version, and one whose recorded range breaks is forced to', () => {
  const tooling = (publish, version) => problemCodes({ publish, versions: proposed({ '@muxui/tooling': version }) });
  assert.deepEqual(tooling(['@muxui/tooling'], '1.1.0-rc.1'), ['P2_1_VERSION_PUBLICATION_MISSING']);
  assert.deepEqual(tooling(['@muxui/tooling'], '1.1.1-rc.1'), []);
  assert.deepEqual(tooling([], '1.1.1-rc.1'), ['P2_1_VERSION_UNIT_UNCHANGED']);
  // A new schema base breaks the catalog's and tooling's recorded ranges, so both republish.
  const schema = { units: { schema: 'minor' }, contracts: { schemaVersion: '3.1.0' }, publish: ['@muxui/schema'] };
  assert.deepEqual(problemCodes({ ...schema, versions: proposed({ '@muxui/schema': '0.7.0-rc.1' }) }), ['P2_1_VERSION_RANGE_BROKEN', 'P2_1_VERSION_RANGE_BROKEN']);
  assert.deepEqual(problemCodes({ ...schema, versions: proposed({ '@muxui/schema': '0.7.0-rc.1', '@muxui/catalog': '2.1.0-rc.2', '@muxui/tooling': '1.1.0-rc.2' }) }), []);
  assert.deepEqual(problemCodes({ ...schema, versions: proposed({ '@muxui/schema': '0.7.0-rc.1', '@muxui/catalog': '2.1.1-rc.1', '@muxui/tooling': '1.1.0-rc.2' }) }), []);
});

test('a contract version moves by its effect, and does not move when the contract did not change', () => {
  const contract = (units, contracts) => problemCodes({ units, contracts });
  assert.deepEqual(contract({ schema: 'minor' }, { schemaVersion: '3.0.1' }), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(contract({ schema: 'minor' }, { schemaVersion: '3.1.0' }), []);
  assert.deepEqual(contract({ queryApi: 'major' }, { queryApiVersion: '2.2.0' }), ['P2_1_VERSION_EFFECT_TOO_SMALL']);
  assert.deepEqual(contract({ tokenContract: 'none' }, { tokenContractVersion: '1.1.1' }), ['P2_1_VERSION_UNIT_UNCHANGED']);
  assert.deepEqual(contract({ tokenContract: 'major' }, { tokenContractVersion: '2.0.0' }), []);
});

test('a prior manifest must inventory the whole publish set, or nothing is compared with it', () => {
  assert.deepEqual(findPriorManifestProblems(priorManifest, publishSet), []);
  // Arbitrary bumps pass against an empty or partial inventory unless the inventory itself is checked.
  const bumped = proposed({ '@muxui/react': '9.9.9-rc.1', '@muxui/catalog': '9.9.9-rc.1' });
  const unusable = (manifest, versions = bumped) => [...new Set(findVersionEffectProblems({ effects: effectsOf({}), priorManifest: manifest, publishSet, versions, contracts: priorManifest.contracts }).map(({ code }) => code))];
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
  // The check that reads the manifest stops on the same inventory before reading any commit.
  assert.throws(() => assertVersionEffects({ priorManifest: variant((manifest) => ({ ...manifest, packages: [] })), revision: 'f'.repeat(40), cwd: repositoryRoot, versions: bumped, publishSet }), /P2_1_PRIOR_RELEASE_INVALID: the prior release manifest is unusable/u);
});

test('a portfolio schema version this tool does not read is refused wherever a prior manifest is read', () => {
  const next = variant((manifest) => ({ ...manifest, schema: 'muxui-portfolio-release-v2' }));
  assert.match(findPriorManifestProblems(next, publishSet).join('; '), /muxui-portfolio-release-v2 is an unknown portfolio release schema version/u);
  assert.match(findPriorManifestProblems({ ...priorManifest, schema: 'other' }, publishSet).join('; '), /it is not a muxui-portfolio-release-v1 document/u);
  assert.deepEqual(findVersionEffectProblems({ effects: effectsOf({}), priorManifest: next, publishSet, versions: proposed(), contracts: priorManifest.contracts }).map(({ code }) => code), ['P2_1_PRIOR_RELEASE_INVALID']);
  assert.throws(() => assertVersionEffects({ priorManifest: next, revision: 'f'.repeat(40), cwd: repositoryRoot, versions: proposed(), publishSet }), /P2_1_PRIOR_RELEASE_INVALID: .*unknown portfolio release schema version/u);
});

test('a catalog major release forces tooling to republish when its recorded range stops admitting the catalog', () => {
  const catalog = { units: { catalog: 'major' }, publish: ['@muxui/catalog'] };
  assert.deepEqual(problemCodes({ ...catalog, versions: proposed({ '@muxui/catalog': '3.0.0-rc.1' }) }), ['P2_1_VERSION_RANGE_BROKEN']);
  assert.deepEqual(problemCodes({ ...catalog, versions: proposed({ '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.1.0-rc.2' }) }), []);
  // The same release against an inventory with no edges would have passed, which is why the inventory is checked first.
  const withoutEdges = variant((manifest) => { manifest.compatibility.edges = []; return manifest; });
  assert.deepEqual(problemCodes({ ...catalog, manifest: withoutEdges, versions: proposed({ '@muxui/catalog': '3.0.0-rc.1' }, withoutEdges) }), ['P2_1_PRIOR_RELEASE_INVALID']);
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

// A throwaway repository holding the sources a release reads, with the package manifests and shipped files of this
// repository's four packages in miniature, so the loader, the implementation digests, and the first-release rule run on real history.
function scratchRepository(scratch) {
  const write = (path, value) => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
  };
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: scratch, encoding: 'utf8' }).trim();
  const [{ record: button }, { record: token }, { record: example, source: exampleSource }, { record: guide, source: guideSource }] = base.records;
  const placeholder = (path, content) => write(/\.\w+$/u.test(path) ? path : `${path}/shipped.mjs`, content);
  // A commit of the sources. `edit` changes one thing: the added prop, the renderer source, or a tooling source.
  const commit = ({ props, rendererSource = 'export const a = 1;\n', cli = 'export {};\n', authoring = 'export {};\n', dependency = '1.0.0' }) => {
    write('packages/catalog/catalog-sources.json', {
      derivedApiSources: { 'web.react': 'packages/react/api' },
      platformSafetyContractPath: 'strategy/platform-safety-contract.json',
      records: [['component', 'catalog/components/button/artifact.json'], ['token-source', 'catalog/tokens/default-theme.json'], ['example', 'catalog/examples/basic.json'], ['guide', 'catalog/guides/usage.json']]
        .map(([family, path]) => ({ family, path })),
    });
    write('strategy/platform-safety-contract.json', base.platformSafetyContract);
    // Button's React API is derived, as in the repository, so the loader has a derived document to read.
    const { api: _api, ...react } = button.bindings['web.react'];
    write('catalog/components/button/artifact.json', { ...button, bindings: { ...button.bindings, 'web.react': react } });
    write('packages/react/api/button.json', {
      schema: 'muxui-derived-api-v1',
      generatedFrom: 'packages/react/src/button.ts',
      component: button.id,
      binding: 'web.react',
      export: 'Button',
      api: {
        props,
        events: [],
        defaults: { disabled: false },
        propDetails: Object.fromEntries(props.map((name) => [name, { type: { kind: 'boolean' }, required: false }])),
        eventDetails: {},
        types: {},
      },
    });
    write('catalog/tokens/default-theme.json', token);
    write('catalog/examples/basic.json', example);
    write(example.source, exampleSource);
    write('catalog/guides/usage.json', guide);
    write(guide.source, guideSource);
    for (const [name, schema] of Object.entries(base.schemas)) write(`packages/schema/schemas/${name}`, schema);
    for (const [name, inputs] of Object.entries(GENERATION_INPUTS)) {
      const directory = `packages/${name.slice('@muxui/'.length)}`;
      const manifest = readJson(join(repositoryRoot, directory, 'package.json'));
      write(`${directory}/package.json`, { ...manifest, dependencies: { ...manifest.dependencies, 'a-dependency': dependency }, version: '1.0.0' });
      for (const entry of [...manifest.files.filter((file) => !['generated', 'README.md', 'LICENSE', 'NOTICE', 'package.json'].includes(file)), ...inputs.map((input) => input.slice(directory.length + 1))]) {
        placeholder(`${directory}/${entry}`, name === '@muxui/react' ? rendererSource : 'export {};\n');
      }
    }
    write('packages/tooling/src/cli.mjs', cli);
    write('packages/tooling/src/authoring.mjs', authoring);
    write('packages/schema/src/index.mjs', "export const SCHEMA_VERSION = '3.0.0';\nexport const API_VERSION = '2.1.0';\nexport const QUERY_SCHEMA_VERSION = '2.1.0';\n");
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'sources');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  return { commit, git, write };
}

test('a release commit is classified from its committed sources against the prior release commit', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const { commit } = scratchRepository(scratch);
    const first = commit({ props: ['disabled'] });
    const second = commit({ props: ['disabled', 'size'], rendererSource: 'export const a = 2;\n' });
    const third = commit({ props: ['disabled', 'size'], rendererSource: 'export const a = 2;\n' });
    const priorHere = variant((manifest) => ({ ...manifest, source: { ...manifest.source, revision: first } }));
    // The catalog and React have stable releases, so the added prop is judged from them.
    const stable = new Map([['@muxui/catalog', '2.1.0'], ['@muxui/react', '0.1.0']]);
    const check = (revision, versions, manifest = priorHere) => assertVersionEffects({ priorManifest: manifest, revision, cwd: scratch, versions, publishSet, stable });
    const message = (revision, versions) => {
      try {
        check(revision, versions);
      } catch (error) {
        return error.message;
      }
      return assert.fail('the versions were accepted');
    };

    // An added optional prop is a catalog and React minor, and React's implementation changed too.
    assert.match(message(second, proposed({ '@muxui/catalog': '2.1.0-rc.2', '@muxui/react': '0.1.0-rc.6' })), /@muxui\/catalog moves the stable 2\.1\.0 to 2\.1\.0-rc\.2 \(none\), but the change needs minor.*@muxui\/react moves the stable 0\.1\.0 to 0\.1\.0-rc\.6 \(none\), but the change needs minor.*Changes: .*muxui:component:button .*props\/1 \(add\)/su);
    assert.match(message(second, proposed({ '@muxui/catalog': '2.2.0-rc.1', '@muxui/react': '0.1.1-rc.1' })), /@muxui\/tooling requires @muxui\/catalog@\^2\.1\.0-rc\.1, which does not admit 2\.2\.0-rc\.1; @muxui\/tooling must publish \(P2_1_VERSION_RANGE_BROKEN\)/u);
    const checked = check(second, proposed({ '@muxui/catalog': '2.2.0-rc.1', '@muxui/react': '0.1.1-rc.1', '@muxui/tooling': '1.1.0-rc.2' }));
    assert.deepEqual(checked.units, { catalog: 'minor', tokenContract: 'none', schema: 'none', queryApi: 'none', renderers: { '@muxui/react': 'minor' } });
    assert.deepEqual(checked.publish, ['@muxui/catalog', '@muxui/react']);
    assert.equal(checked.priorRevision, first);
    // The same sources release nothing.
    assert.deepEqual(check(third, proposed(), variant((manifest) => ({ ...manifest, source: { ...manifest.source, revision: second } }))).publish, []);
    // A prior manifest that is not a portfolio manifest, does not match its commit, or whose commit is unreadable stops the check.
    assert.throws(() => check(third, proposed(), { ...priorHere, schema: 'other' }), /P2_1_PRIOR_RELEASE_INVALID/u);
    assert.throws(() => check(third, proposed(), variant((manifest) => ({ ...manifest, source: { ...manifest.source, revision: first }, contracts: { ...manifest.contracts, schemaVersion: '4.0.0' } }))), /P2_1_PRIOR_RELEASE_MISMATCH/u);
    assert.throws(() => check(third, proposed(), variant((manifest) => ({ ...manifest, source: { ...manifest.source, revision: 'f'.repeat(40) } }))), /P2_1_PRIOR_RELEASE_UNAVAILABLE/u);
    // A side holds the records (a component with its derived API), schemas, the platform-safety contract, contract versions, and one digest per package.
    const side = readCommittedSide(second, scratch);
    assert.deepEqual(side.records.map(({ family }) => family), ['component', 'token-source', 'example', 'guide']);
    assert.deepEqual(Object.keys(side.records[0].derivedApis), ['web.react']);
    assert.deepEqual(Object.keys(side.schemas), ['component.schema.json', 'query-envelope.schema.json', 'token-source.schema.json']);
    assert.deepEqual(side.platformSafetyContract, base.platformSafetyContract);
    assert.deepEqual(side.contracts, { schemaVersion: '3.0.0', queryApiVersion: '2.1.0', querySchemaVersion: '2.1.0', tokenContractVersion: '1.1.0' });
    assert.deepEqual(Object.keys(side.implementation), packageNames);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// Decision 0032 item 9 and E-P2.1-03: a later release publishes the packages whose version units changed and reuses the
// rest. A reused package proposes the version the prior release recorded, so the version check needs no second path: an
// unchanged package at its version is reused, a changed one at its version is refused, and a forced one cannot be reused.
test('reusing a package is proposing its prior version: an unchanged package passes, a changed or forced one is refused', () => {
  const reuse = (publish, units, changes = {}, manifest = priorManifest) => problemCodes({ units, publish, versions: proposed(changes, manifest), manifest });
  // Nothing changed but tooling's implementation (the real first use): tooling alone takes a new version, the rest stay.
  assert.deepEqual(reuse(['@muxui/tooling'], {}, { '@muxui/tooling': '1.1.0-rc.2' }), []);
  // Reusing the changed package, whichever kind it is, is refused instead of silently carried over.
  assert.deepEqual(reuse(['@muxui/tooling'], {}), ['P2_1_VERSION_PUBLICATION_MISSING']);
  assert.deepEqual(reuse(['@muxui/schema'], {}), ['P2_1_VERSION_PUBLICATION_MISSING']);
  assert.deepEqual(reuse(['@muxui/catalog'], { catalog: 'minor' }), ['P2_1_VERSION_NOT_AHEAD']);
  assert.deepEqual(reuse(['@muxui/react'], { renderers: { '@muxui/react': 'patch' } }), ['P2_1_VERSION_NOT_AHEAD']);
  // Publishing a package whose unit did not change is refused, so an input for an unchanged package cannot slip through.
  assert.deepEqual(reuse([], {}, { '@muxui/react': '0.1.0-rc.6' }), ['P2_1_VERSION_UNIT_UNCHANGED']);
  assert.deepEqual(reuse([], {}, { '@muxui/catalog': '2.1.0-rc.2', '@muxui/tooling': '1.1.0-rc.2' }), ['P2_1_VERSION_UNIT_UNCHANGED', 'P2_1_VERSION_UNIT_UNCHANGED']);
  assert.deepEqual(reuse([], {}, { '@muxui/schema': '0.6.0-rc.2' }), ['P2_1_VERSION_UNIT_UNCHANGED']);
  // A package whose recorded range no longer admits a sibling's new version is forced to publish: it cannot be reused.
  assert.deepEqual(reuse(['@muxui/catalog'], { catalog: 'major' }, { '@muxui/catalog': '3.0.0-rc.1' }), ['P2_1_VERSION_RANGE_BROKEN']);
  assert.deepEqual(reuse(['@muxui/catalog'], { catalog: 'major' }, { '@muxui/catalog': '3.0.0-rc.1', '@muxui/tooling': '1.1.0-rc.2' }), []);
  // A prior release that itself reused packages judges them at the versions it recorded.
  const reusedBefore = variant((manifest) => { manifest.packages[0].role = 'reused'; manifest.packages[3].role = 'reused'; return manifest; });
  assert.deepEqual(reuse(['@muxui/tooling'], {}, { '@muxui/tooling': '1.1.0-rc.2' }, reusedBefore), []);
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

test('the tooling-only release the first portfolio release needs: a real change to tooling publishes tooling and reuses the rest', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const { commit } = scratchRepository(scratch);
    const first = commit({ props: ['disabled'] });
    const fixed = commit({ props: ['disabled'], cli: 'export const fixed = 1;\n' });
    const atFirst = variant((manifest) => ({ ...manifest, source: { ...manifest.source, revision: first } }));
    const prior = seal({ ...atFirst, packages: atFirst.packages.map((record) => ({ ...record, provenance: { kind: 'release-commit', releaseId: atFirst.id, sourceCommit: first } })) });
    // The versions go through the plan the preparation takes, then the version check against the committed sources.
    const check = (published) => {
      const { versions } = planReuse({ publishSet, published: new Map(Object.entries(published)), priorRelease: { first: false, priorManifest: prior }, revision: fixed, cwd: scratch, readRetained: () => new Map() });
      return assertVersionEffects({ priorManifest: prior, revision: fixed, cwd: scratch, versions, publishSet });
    };
    const message = (published) => {
      try {
        check(published);
      } catch (error) {
        return error.message;
      }
      return assert.fail('the release was accepted');
    };

    const checked = check({ '@muxui/tooling': '1.1.0-rc.2' });
    assert.equal(checked.status, 'checked');
    assert.deepEqual(checked.publish, ['@muxui/tooling'], 'only tooling changed');
    assert.deepEqual(Object.values(checked.units.renderers), ['none']);
    // Publishing what did not change is refused, and so is reusing what did.
    assert.match(message({ '@muxui/tooling': '1.1.0-rc.2', '@muxui/react': '0.1.0-rc.6' }), /@muxui\/react moves 0\.1\.0-rc\.5 to 0\.1\.0-rc\.6, but its contract did not change \(P2_1_VERSION_UNIT_UNCHANGED\)/u);
    assert.match(message({ '@muxui/tooling': '1.1.0-rc.2', '@muxui/schema': '0.6.0-rc.2' }), /@muxui\/schema moves 0\.6\.0-rc\.1 to 0\.6\.0-rc\.2, but nothing it ships changed \(P2_1_VERSION_UNIT_UNCHANGED\)/u);
    assert.match(message({ '@muxui/schema': '0.6.0-rc.2' }), /@muxui\/tooling stays 1\.1\.0-rc\.1, but its shipped contract or implementation changed \(P2_1_VERSION_PUBLICATION_MISSING\)/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('a package\'s implementation digest follows what it ships and what generates it, not an unpublished entry', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const { commit } = scratchRepository(scratch);
    const digests = (options) => readCommittedSide(commit({ props: ['disabled'], ...options }), scratch).implementation;
    const before = digests({});
    const changed = (options) => Object.keys(before).filter((name) => digests(options)[name] !== before[name]);
    // Tooling's workspace-only authoring entry ships in no package; a shipped source changes only tooling.
    assert.deepEqual(changed({ authoring: 'export const edited = 1;\n' }), []);
    assert.deepEqual(changed({ cli: 'export const edited = 1;\n' }), ['@muxui/tooling']);
    assert.deepEqual(changed({ rendererSource: 'export const edited = 1;\n' }), ['@muxui/react']);
    // The manifest ships, less its version: a dependency edit changes every package, and a version bump none.
    assert.deepEqual(changed({ dependency: '2.0.0' }), packageNames);
    // Every package's generation inputs are tracked sources, so a generator change reaches its package.
    for (const [name, inputs] of Object.entries(GENERATION_INPUTS)) assert.ok(inputs.every((input) => input.startsWith(`packages/${name.slice('@muxui/'.length)}/`)), name);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('a release names its prior release from the ledger, or declares the first and agrees with the tree', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const { commit, git, write } = scratchRepository(scratch);
    const clean = commit({ props: ['disabled'] });
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
