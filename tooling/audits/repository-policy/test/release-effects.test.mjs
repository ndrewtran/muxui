import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { validateFamily } from '@muxui/schema';
import {
  IMPLEMENTATION_ROOTS,
  NEW_PACKAGES,
  assertVersionEffects,
  classifyReleaseEffects,
  compareVersions,
  findCandidateSetProblems,
  findVersionEffectProblems,
  movedEffect,
  readCommittedSide,
} from '../src/release-effects.mjs';
import { PORTFOLIO_SCHEMA } from '../src/release-manifest.mjs';
import { readPublishSet } from '../src/release-set.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixtureDirectory = join(import.meta.dirname, 'fixtures/version-effects');
const packageNames = readPublishSet(repositoryRoot).packages.map(({ name }) => name);
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
      { catalog: effects.units.catalog, tokenContract: effects.units.tokenContract, schema: effects.units.schema, queryApi: effects.units.queryApi, renderers: effects.units.renderers, publish: effects.publish },
      { catalog: 'none', tokenContract: 'none', schema: 'none', queryApi: 'none', renderers: { '@muxui/react': 'none' }, publish: [], ...expect },
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

// A prior portfolio manifest with the fields the check reads: package versions, contract versions, and recorded edges.
const priorManifest = {
  schema: PORTFOLIO_SCHEMA,
  id: 'muxui-portfolio:prior',
  source: { revision: 'a'.repeat(40) },
  packages: [['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.1'], ['@muxui/react', '0.1.0-rc.5']].map(([name, version]) => ({ name, version })),
  contracts: { schemaVersion: '3.0.0', queryApiVersion: '2.1.0', tokenContractVersion: '1.1.0' },
  compatibility: {
    edges: [
      { from: '@muxui/catalog', to: '@muxui/schema', range: '^0.6.0-rc.1', version: '0.6.0-rc.1' },
      { from: '@muxui/tooling', to: '@muxui/catalog', range: '^2.1.0-rc.1', version: '2.1.0-rc.1' },
      { from: '@muxui/tooling', to: '@muxui/schema', range: '^0.6.0-rc.1', version: '0.6.0-rc.1' },
    ],
  },
};
const proposed = (changes = {}, manifest = priorManifest) => new Map([...manifest.packages.map(({ name, version }) => [name, version]), ...Object.entries(changes)]);
const effectsOf = (units, publish = []) => ({ first: false, units: { catalog: 'none', tokenContract: 'none', schema: 'none', queryApi: 'none', renderers: { '@muxui/react': 'none' }, ...units }, publish, reasons: [] });
const problemCodes = ({ units, publish, versions = proposed(), contracts = {}, manifest = priorManifest, stable }) => findVersionEffectProblems({
  effects: effectsOf(units, publish),
  priorManifest: manifest,
  versions,
  contracts: { ...priorManifest.contracts, ...contracts },
  stable,
}).map(({ code }) => code);
// A prior release whose catalog and React are stable, so the next release is judged against them.
const stableManifest = {
  ...priorManifest,
  packages: priorManifest.packages.map((entry) => ({ ...entry, version: { '@muxui/catalog': '2.1.0', '@muxui/react': '0.1.0' }[entry.name] ?? entry.version })),
  compatibility: { edges: [] },
};

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
  assert.deepEqual(problemCodes({ versions: proposed({ '@muxui/react': '0.1.0-rc.4' }) }), ['P2_1_VERSION_NOT_AHEAD']);
});

test('after a stable release, a version must carry the effect of the change from that release', () => {
  const catalog = (effect, version, { manifest = stableManifest, stable } = {}) => problemCodes({ units: { catalog: effect }, publish: ['@muxui/catalog'], manifest, versions: proposed({ '@muxui/catalog': version }, manifest), stable });
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
  const prerelease = { manifest: { ...stableManifest, packages: stableManifest.packages.map((entry) => ({ ...entry, version: entry.name === '@muxui/catalog' ? '2.2.0-rc.1' : entry.version })) }, stable: new Map([['@muxui/catalog', '2.1.0']]) };
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

test('every file a package ships from a tracked source is covered by its implementation roots', () => {
  const tracked = execFileSync('git', ['ls-files', 'packages'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\n');
  for (const name of packageNames) {
    const directory = `packages/${name.slice('@muxui/'.length)}`;
    const { files } = readJson(join(repositoryRoot, directory, 'package.json'));
    for (const entry of files.filter((file) => !['README.md', 'LICENSE', 'NOTICE', 'package.json', 'generated'].includes(file))) {
      const shipped = tracked.filter((path) => path === `${directory}/${entry}` || path.startsWith(`${directory}/${entry}/`));
      assert.ok(shipped.length > 0, `${name} ships ${entry}`);
      for (const path of shipped) assert.ok(IMPLEMENTATION_ROOTS[name].some((root) => path === root || path.startsWith(`${root}/`)), `${path} is not under ${name}'s implementation roots`);
    }
  }
});

// The loader against real history: a throwaway repository with commits of the sources a release reads.
test('a release commit is classified from its committed sources against the prior release commit', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'muxui-release-effects-test-'));
  try {
    const write = (path, value) => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
    };
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: scratch, encoding: 'utf8' }).trim();
    const [{ record: button }, { record: token }, { record: example, source: exampleSource }, { record: guide, source: guideSource }] = base.records;
    const commit = (props, rendererSource) => {
      write('packages/catalog/catalog-sources.json', {
        derivedApiSources: { 'web.react': 'packages/react/api' },
        records: [['component', 'catalog/components/button/artifact.json'], ['token-source', 'catalog/tokens/default-theme.json'], ['example', 'catalog/examples/basic.json'], ['guide', 'catalog/guides/usage.json']]
          .map(([family, path]) => ({ family, path })),
      });
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
      write('packages/schema/src/index.mjs', "export const SCHEMA_VERSION = '3.0.0';\nexport const API_VERSION = '2.1.0';\n");
      for (const [name, roots] of Object.entries(IMPLEMENTATION_ROOTS)) {
        write(`packages/${name.slice('@muxui/'.length)}/package.json`, { name, version: '1.0.0', scripts: { test: 'x' } });
        for (const root of roots) write(/\.\w+$/u.test(root) ? root : `${root}/implementation.mjs`, name === '@muxui/react' ? rendererSource : 'export {};\n');
      }
      write('packages/schema/src/index.mjs', "export const SCHEMA_VERSION = '3.0.0';\nexport const API_VERSION = '2.1.0';\n");
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', 'sources');
      return git('rev-parse', 'HEAD');
    };
    git('init', '-q');
    const first = commit(['disabled'], 'export const a = 1;\n');
    const second = commit(['disabled', 'size'], 'export const a = 2;\n');
    const third = commit(['disabled', 'size'], 'export const a = 2;\n');
    const priorHere = { ...priorManifest, source: { revision: first } };
    // The catalog and React have stable releases, so the added prop is judged from them.
    const stable = new Map([['@muxui/catalog', '2.1.0'], ['@muxui/react', '0.1.0']]);
    const check = (revision, versions, manifest = priorHere) => assertVersionEffects({ priorManifest: manifest, revision, cwd: scratch, versions, packageNames, stable });
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
    assert.deepEqual(check(third, proposed(), { ...priorHere, source: { revision: second } }).publish, []);
    // A prior manifest that is not a portfolio manifest, does not match its commit, or whose commit is unreadable stops the check.
    assert.throws(() => check(third, proposed(), { ...priorHere, schema: 'other' }), /P2_1_PRIOR_RELEASE_INVALID/u);
    assert.throws(() => check(third, proposed(), { ...priorHere, contracts: { ...priorHere.contracts, schemaVersion: '4.0.0' } }), /P2_1_PRIOR_RELEASE_MISMATCH/u);
    assert.throws(() => check(third, proposed(), { ...priorHere, source: { revision: 'f'.repeat(40) } }), /P2_1_PRIOR_RELEASE_UNAVAILABLE/u);
    // A side holds the records (a component with its derived API), schemas, contract versions, and one digest per package.
    const side = readCommittedSide(second, scratch);
    assert.deepEqual(side.records.map(({ family }) => family), ['component', 'token-source', 'example', 'guide']);
    assert.deepEqual(Object.keys(side.records[0].derivedApis), ['web.react']);
    assert.deepEqual(Object.keys(side.schemas), ['component.schema.json', 'query-envelope.schema.json']);
    assert.deepEqual(side.contracts, { schemaVersion: '3.0.0', queryApiVersion: '2.1.0', tokenContractVersion: '1.1.0' });
    assert.deepEqual(Object.keys(side.implementation), packageNames);
    assert.notEqual(readCommittedSide(first, scratch).implementation['@muxui/react'], side.implementation['@muxui/react']);
    assert.equal(readCommittedSide(first, scratch).implementation['@muxui/tooling'], side.implementation['@muxui/tooling']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
