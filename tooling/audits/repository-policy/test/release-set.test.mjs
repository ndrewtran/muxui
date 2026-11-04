import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { API_VERSION } from '@muxui/schema';
import { canonicalJson } from '../src/canonical-json.mjs';
import {
  CANDIDATE_PUBLISH_CONFIG,
  assertCatalogRangeBound,
  descriptorExports,
  findDescriptorExportProblems,
  findPackedPackageProblems,
  rewritePackedManifest,
  siblingRange,
  stampDescriptorProvenance,
} from '../src/release-package.mjs';
import {
  candidateFileNames,
  candidateVersionProblem,
  nextCandidateVersion,
  parseReleaseVersions,
  readPublishSet,
  readSourceVersions,
  releaseVersions,
  reusedNames,
  tarballFileName,
  validatePublishSet,
} from '../src/release-set.mjs';
import { caretAllows } from '../src/release-manifest.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const publishSet = readPublishSet(repositoryRoot);
const sourceVersions = readSourceVersions(publishSet, repositoryRoot);
const sourceManifest = (entry) => JSON.parse(readFileSync(resolve(repositoryRoot, entry.path, 'package.json'), 'utf8'));
const entryOf = (name) => publishSet.packages.find((entry) => entry.name === name);
const revision = 'a'.repeat(40);
const firstRelease = 'MUXUI_RELEASE_VERSIONS=@muxui/schema=0.6.0-rc.1,@muxui/catalog=2.1.0-rc.1,@muxui/tooling=1.1.0-rc.1,@muxui/react=0.1.0-rc.5'.split('=').slice(1).join('=');

test('the publish set is Decision 0032: schema, catalog, tooling, React, in that order, along the declared edges', () => {
  assert.deepEqual(publishSet.packages.map(({ name }) => name), ['@muxui/schema', '@muxui/catalog', '@muxui/tooling', '@muxui/react']);
  assert.deepEqual(Object.fromEntries(publishSet.packages.map(({ name, runtimeEdges }) => [name, runtimeEdges])), {
    '@muxui/schema': [],
    '@muxui/catalog': ['@muxui/schema'],
    '@muxui/tooling': ['@muxui/catalog', '@muxui/schema'],
    '@muxui/react': [],
  });
  for (const entry of publishSet.packages) {
    const source = sourceManifest(entry);
    assert.equal(source.name, entry.name);
    assert.equal(source.private, true, `${entry.name} stays private at source until its publish is authorized`);
    // The declared edges are the source's Mux UI runtime dependencies, so a new dependency must update the set.
    assert.deepEqual(Object.keys(source.dependencies ?? {}).filter((name) => name.startsWith('@muxui/')).sort(), [...entry.runtimeEdges].sort(), entry.name);
  }
});

test('a publish set must name unique packages at packages/<slug>, with edges only to packages that publish first', () => {
  const bad = (change) => assert.throws(() => validatePublishSet(change(structuredClone(publishSet))), /P2_1_PUBLISH_SET_INVALID/u);
  bad((value) => ({ ...value, schema: 'other' }));
  bad((value) => ({ ...value, packages: [] }));
  bad((value) => { value.packages[1].name = '@muxui/schema'; return value; });
  bad((value) => { value.packages[0].path = 'packages/catalog'; return value; });
  bad((value) => { value.packages[0].runtimeEdges = ['@muxui/catalog']; return value; });
  bad((value) => { value.packages[0].name = 'schema'; return value; });
});

test('a release gives every member of the set an rc of its source version, or defaults each to rc.1 locally', () => {
  const versions = parseReleaseVersions(firstRelease, publishSet, sourceVersions);
  assert.deepEqual([...versions], [['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.1'], ['@muxui/react', '0.1.0-rc.5']]);
  assert.deepEqual([...parseReleaseVersions(undefined, publishSet, sourceVersions).values()], ['0.6.0-rc.1', '2.1.0-rc.1', '1.1.0-rc.1', '0.1.0-rc.1']);
  const rejects = (text, pattern) => assert.throws(() => parseReleaseVersions(text, publishSet, sourceVersions), pattern);
  rejects(firstRelease.replace(',@muxui/react=0.1.0-rc.5', ''), /@muxui\/react needs a version/u);
  rejects(`${firstRelease},@muxui/tokens=2.0.0-rc.1`, /@muxui\/tokens is not in the publish set/u);
  rejects(`${firstRelease},@muxui/schema=0.6.0-rc.2`, /@muxui\/schema is listed twice/u);
  rejects(firstRelease.replace('0.6.0-rc.1', '0.6.0'), /@muxui\/schema: "0\.6\.0" is not an rc version/u);
  rejects(firstRelease.replace('0.6.0-rc.1', '0.7.0-rc.1'), /not a prerelease of the source version 0\.6\.0/u);
  rejects(firstRelease.replace('2.1.0-rc.1', '2.1.0-rc.0'), /@muxui\/catalog: "2\.1\.0-rc\.0" is not an rc version/u);
  rejects(firstRelease.replace('0.1.0-rc.5', '0.2.0-rc.1'), /@muxui\/react: 0\.2\.0-rc\.1 is not a prerelease of the source version 0\.1\.0-alpha\.0/u);
  rejects('@muxui/schema', /is not name=version/u);
  assert.equal(candidateVersionProblem('2.1.0-rc.12', '2.1.0'), null);
  assert.equal(nextCandidateVersion('2.1.0-rc.12'), '2.1.0-rc.13');
});

test('an empty version reuses a package, which only a later release can do, and a release publishes at least one', () => {
  const tooling = '@muxui/schema=,@muxui/catalog=,@muxui/tooling=1.1.0-rc.2,@muxui/react=';
  const published = parseReleaseVersions(tooling, publishSet, sourceVersions);
  assert.deepEqual([...published], [['@muxui/tooling', '1.1.0-rc.2']], 'the Map holds the published packages');
  assert.deepEqual(reusedNames(publishSet, published), ['@muxui/schema', '@muxui/catalog', '@muxui/react']);
  assert.deepEqual(reusedNames(publishSet, parseReleaseVersions(firstRelease, publishSet, sourceVersions)), []);
  // A reused package takes the version its record gives; a published one the version given.
  const records = new Map([['@muxui/schema', { version: '0.6.0-rc.1' }], ['@muxui/catalog', { version: '2.1.0-rc.1' }], ['@muxui/react', { version: '0.1.0-rc.5' }]]);
  assert.deepEqual([...releaseVersions(publishSet, published, records)], [['@muxui/schema', '0.6.0-rc.1'], ['@muxui/catalog', '2.1.0-rc.1'], ['@muxui/tooling', '1.1.0-rc.2'], ['@muxui/react', '0.1.0-rc.5']]);
  // Leaving a package out of the text is not reusing it: reuse is said, as an empty version.
  assert.throws(() => parseReleaseVersions('@muxui/schema=,@muxui/catalog=,@muxui/tooling=1.1.0-rc.2', publishSet, sourceVersions), /@muxui\/react needs a version, or `@muxui\/react=` to reuse the package of the prior release/u);
  assert.throws(() => parseReleaseVersions('@muxui/schema=,@muxui/catalog=,@muxui/tooling=,@muxui/react=', publishSet, sourceVersions), /a release publishes at least one package/u);
  assert.throws(() => parseReleaseVersions(tooling.replace('1.1.0-rc.2', '2.0.0-rc.1'), publishSet, sourceVersions), /@muxui\/tooling: 2\.0\.0-rc\.1 is not a prerelease of the source version 1\.1\.0/u);
  assert.throws(() => parseReleaseVersions(`${tooling},@muxui/tooling=`, publishSet, sourceVersions), /@muxui\/tooling is listed twice/u);
  // The same check runs in seconds ahead of the preparation, and the first portfolio release reuses nothing.
  const run = (environment) => spawnSync(process.execPath, [resolve(import.meta.dirname, '../src/release-set.mjs'), 'validate-versions'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...environment } });
  const accepted = run({ MUXUI_RELEASE_VERSIONS: tooling });
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout, '@muxui/schema reused\n@muxui/catalog reused\n@muxui/tooling 1.1.0-rc.2\n@muxui/react reused\n');
  assert.match(run({ MUXUI_RELEASE_VERSIONS: tooling, MUXUI_FIRST_PORTFOLIO_RELEASE: 'true' }).stdout, /P2_1_REUSE_NEEDS_PRIOR_RELEASE: @muxui\/schema, @muxui\/catalog, @muxui\/react are reused, and the first portfolio release has no prior release to reuse from/u);
  assert.equal(run({ MUXUI_RELEASE_VERSIONS: firstRelease, MUXUI_FIRST_PORTFOLIO_RELEASE: 'true' }).status, 0);
});

test('a candidate holds one tarball per published package in publish order and the portfolio manifest', () => {
  const versions = parseReleaseVersions(firstRelease, publishSet, sourceVersions);
  assert.deepEqual(candidateFileNames(publishSet, versions), [
    'muxui-schema-0.6.0-rc.1.tgz',
    'muxui-catalog-2.1.0-rc.1.tgz',
    'muxui-tooling-1.1.0-rc.1.tgz',
    'muxui-react-0.1.0-rc.5.tgz',
    'muxui-portfolio.release-manifest.json',
  ]);
  // A reused package has no tarball in the candidate.
  assert.deepEqual(candidateFileNames(publishSet, new Map([['@muxui/tooling', '1.1.0-rc.2']])), ['muxui-tooling-1.1.0-rc.2.tgz', 'muxui-portfolio.release-manifest.json']);
  assert.equal(tarballFileName('@muxui/react', '0.1.0-rc.5'), 'muxui-react-0.1.0-rc.5.tgz');
});

test('tooling\'s catalog range is bound to the query API major, and the candidate set satisfies its own ranges', () => {
  assertCatalogRangeBound({ catalogVersion: '2.1.0-rc.1', queryApiVersion: API_VERSION });
  assert.throws(() => assertCatalogRangeBound({ catalogVersion: '3.0.0-rc.1', queryApiVersion: API_VERSION }), /P2_1_CATALOG_RANGE_UNBOUND: catalog 3\.0\.0-rc\.1 is not a release of the query API major 2/u);
  const versions = parseReleaseVersions(firstRelease, publishSet, sourceVersions);
  assert.equal(siblingRange(versions.get('@muxui/catalog')), '^2.1.0-rc.1');
  // `^2.1.0-rc.1` admits later builds of the line and not the prerelease line of the next minor.
  assert.equal(caretAllows('^2.1.0-rc.1', '2.1.0-rc.2'), true);
  assert.equal(caretAllows('^2.1.0-rc.1', '2.2.0-rc.1'), false);
});

// The tarball `pnpm pack` writes for a source manifest: publishConfig.exports applied, workspace specifiers exact.
function packedFrom(entry, versions) {
  const source = sourceManifest(entry);
  const exact = (dependencies) => Object.fromEntries(Object.entries(dependencies ?? {}).map(([name, range]) => [
    name,
    range.startsWith('workspace:') ? sourceVersions.get(name) ?? '2.0.0' : range,
  ]));
  const { publishConfig: _publishConfig, ...rest } = source;
  const packed = structuredClone({ ...rest, exports: source.publishConfig?.exports ?? source.exports });
  if (source.dependencies) packed.dependencies = exact(source.dependencies);
  if (source.devDependencies) packed.devDependencies = exact(source.devDependencies);
  return { source, packed: rewritePackedManifest({ packed, entry, versions, sourceRevision: revision }) };
}

const targetsOf = (value) => (typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targetsOf));

// The archive paths a tarball of the manifest holds: its metadata, the public entry targets, and its `files` directories.
function entriesFor(source, packed) {
  const targets = [...targetsOf(packed.exports), ...targetsOf(packed.bin)].filter((target) => !target.includes('*')).map((target) => `package/${target.slice(2)}`);
  const directories = source.files.filter((file) => !file.includes('.')).map((directory) => `package/${directory}/entry.mjs`);
  return [...new Set(['package/package.json', 'package/README.md', 'package/LICENSE', ...targets, ...directories])];
}

function audit(name, change = () => {}) {
  const entry = entryOf(name);
  const versions = parseReleaseVersions(firstRelease, publishSet, sourceVersions);
  const { source, packed } = packedFrom(entry, versions);
  const entries = entriesFor(source, packed);
  change(packed, entries, source);
  return [...new Set(findPackedPackageProblems({ entry, source, packed, entries, versions, sourceRevision: revision }).map(({ code }) => code))];
}

test('E-P2.1-01 every candidate manifest passes the pack audit: public entries, allowed edges, rc ranges, no scripts', () => {
  for (const { name } of publishSet.packages) assert.deepEqual(audit(name), [], name);
  const { packed } = packedFrom(entryOf('@muxui/tooling'), parseReleaseVersions(firstRelease, publishSet, sourceVersions));
  assert.deepEqual(packed.dependencies['@muxui/catalog'], '^2.1.0-rc.1');
  assert.deepEqual(packed.dependencies['@muxui/schema'], '^0.6.0-rc.1');
  assert.equal(packed.version, '1.1.0-rc.1');
  assert.equal(packed.private, false);
  assert.equal(packed.gitHead, revision);
  assert.deepEqual(packed.publishConfig, CANDIDATE_PUBLISH_CONFIG);
  for (const field of ['scripts', 'devDependencies']) assert.equal(Object.hasOwn(packed, field), false, field);
});

test('E-P2.1-01 negative: a leaked compiler or authoring entry fails', () => {
  assert.deepEqual(audit('@muxui/catalog', (packed, entries) => {
    packed.exports['./compiler'] = './src/compiler.mjs';
    entries.push('package/src/compiler.mjs');
  }), ['P2_1_PACK_ENTRY_LEAKED', 'P2_1_PACK_FILE_UNDECLARED']);
  // The entry file alone, without its export, is a leak too.
  assert.deepEqual(audit('@muxui/catalog', (_packed, entries) => entries.push('package/src/compiler.mjs')), ['P2_1_PACK_ENTRY_LEAKED', 'P2_1_PACK_FILE_UNDECLARED']);
  assert.deepEqual(audit('@muxui/tooling', (packed, entries) => {
    packed.exports['./authoring'] = './src/authoring.mjs';
    entries.push('package/src/authoring.mjs');
  }), ['P2_1_PACK_ENTRY_LEAKED', 'P2_1_PACK_FILE_UNDECLARED']);
  assert.deepEqual(audit('@muxui/schema', (packed) => { packed.exports['./extra'] = './src/index.mjs'; }), ['P2_1_PACK_EXPORTS_DRIFT']);
  assert.deepEqual(audit('@muxui/catalog', (_packed, entries) => entries.splice(entries.indexOf('package/generated/entry.mjs'), 1, 'package/test/entry.mjs')), ['P2_1_PACK_FILE_UNDECLARED']);
  assert.deepEqual(audit('@muxui/schema', (_packed, entries) => entries.splice(entries.indexOf('package/src/index.mjs'), 1)), ['P2_1_PACK_ENTRY_MISSING']);
});

test('E-P2.1-01 negative: a workspace specifier, an unlisted dependency, and a tokens dependency each fail', () => {
  assert.ok(audit('@muxui/catalog', (packed) => { packed.dependencies['@muxui/schema'] = 'workspace:*'; }).includes('P2_1_PACK_WORKSPACE_SPECIFIER'));
  assert.ok(audit('@muxui/catalog', (packed) => { packed.dependencies['@muxui/schema'] = '0.6.0'; }).includes('P2_1_PACK_EDGE_RANGE'));
  assert.deepEqual(audit('@muxui/tooling', (packed) => { packed.dependencies['left-pad'] = '1.3.0'; }), ['P2_1_PACK_UNLISTED_DEPENDENCY']);
  assert.deepEqual(audit('@muxui/tooling', (packed) => { packed.dependencies['@muxui/foundation'] = '1.0.0'; }), ['P2_1_PACK_UNLISTED_DEPENDENCY']);
  // The schema and React depend on no Mux UI package, and an edge outside the declared ones fails for the rest.
  assert.deepEqual(audit('@muxui/schema', (packed) => { packed.dependencies = { '@muxui/catalog': '^2.1.0-rc.1' }; }), ['P2_1_PACK_UNLISTED_DEPENDENCY']);
  assert.deepEqual(audit('@muxui/catalog', (packed) => { packed.dependencies['@muxui/tooling'] = '^1.1.0-rc.1'; }), ['P2_1_PACK_UNLISTED_DEPENDENCY']);
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.ok(audit('@muxui/catalog', (packed) => { packed[field] = { ...packed[field], '@muxui/tokens': '2.0.0' }; }).includes('P2_1_PACK_TOKENS_DEPENDENCY'), field);
  }
  // A retained development dependency or lifecycle script is not part of a published package either.
  assert.deepEqual(audit('@muxui/catalog', (packed) => { packed.devDependencies = { '@muxui/tokens': '2.0.0' }; }), ['P2_1_PACK_MANIFEST_DRIFT']);
  assert.deepEqual(audit('@muxui/react', (packed) => { packed.scripts = { postinstall: 'node x.mjs' }; }), ['P2_1_PACK_MANIFEST_DRIFT']);
  assert.deepEqual(audit('@muxui/schema', (packed) => { packed.gitHead = 'b'.repeat(40); }), ['P2_1_PACK_MANIFEST_DRIFT']);
});

test('E-P2.1-01 negative: a dependency that installs from anywhere but the registry, or at another range than the source declares, fails', () => {
  // The source declares `semver` at an exact registry version; the packed manifest must say the same.
  for (const spec of ['file:../private-semver', 'link:../semver', 'git+https://example.com/semver.git', 'git://example.com/semver.git', 'https://example.com/semver.tgz',
    'github:someone/semver', 'someone/semver', 'someone/semver#main', 'npm:other-package@1.0.0', 'workspace:*', '../semver', 'portal:../semver']) {
    const codes = audit('@muxui/tooling', (packed) => { packed.dependencies.semver = spec; });
    assert.ok(codes.some((code) => ['P2_1_PACK_DEPENDENCY_SOURCE', 'P2_1_PACK_WORKSPACE_SPECIFIER'].includes(code)), `${spec}: ${codes}`);
  }
  for (const field of ['optionalDependencies', 'peerDependencies']) {
    assert.ok(audit('@muxui/tooling', (packed) => { packed[field] = { semver: 'file:../private-semver' }; }).includes('P2_1_PACK_DEPENDENCY_SOURCE'), field);
  }
  // A registry range that is not the one the source declares is a different dependency.
  assert.deepEqual(audit('@muxui/tooling', (packed) => { packed.dependencies.semver = '^7.0.0'; }), ['P2_1_PACK_DEPENDENCY_SOURCE']);
  assert.deepEqual(audit('@muxui/react', (packed) => { packed.peerDependencies.react = '*'; }), ['P2_1_PACK_MANIFEST_DRIFT', 'P2_1_PACK_DEPENDENCY_SOURCE']);
  // The declared ranges, including peer ranges with spaces, pass.
  assert.deepEqual(audit('@muxui/react'), []);
  assert.deepEqual(audit('@muxui/tooling'), []);
});

test('E-P2.1-01 an allowlist, not a blacklist: only a registry range or dist-tag passes, even when the source declares the same', () => {
  // The source and the packed manifest agree, so equality alone would pass: the specifier itself must be a registry one.
  const declared = (spec) => audit('@muxui/tooling', (packed, _entries, source) => {
    source.dependencies.semver = spec;
    packed.dependencies.semver = spec;
  });
  for (const spec of ['git@github.com:npm/node-semver.git', 'git+ssh://git@github.com/npm/node-semver.git', 'github:user/repo', 'user/repo', 'user/repo#semver:^7',
    'https://example.com/semver.tgz', 'file:../semver', 'link:../semver', 'npm:alias@1', 'portal:../semver', '../semver', '~/semver', '']) {
    assert.deepEqual(declared(spec), ['P2_1_PACK_DEPENDENCY_SOURCE'], JSON.stringify(spec));
  }
  for (const spec of ['7.8.5', '^1.2.3-rc.1', '>=1 <2 || 3.x', 'latest', '~2.0.0', '1.2.3 - 2.3.4', '*', '1.x', '>=1.0.0-beta.1+build.5']) {
    assert.deepEqual(declared(spec), [], spec);
  }
  assert.deepEqual(audit('@muxui/tooling', (packed, _entries, source) => {
    source.dependencies.semver = 'github:user/repo';
  }), ['P2_1_PACK_DEPENDENCY_SOURCE'], 'a registry range in the pack that the source no longer declares');
});

const sampleDescriptor = {
  id: 'renderer:@muxui/react',
  bindings: {
    'muxui:component:button#web.react': { export: '@muxui/react#Button' },
    'muxui:component:markdown#web.react': { export: '@muxui/react/markdown#Markdown' },
  },
};

test('E-P2.1-02 the pack-time descriptor audit finds every binding\'s member in its module, and only there', () => {
  const exportNames = new Map([['@muxui/react', ['Button', 'Card']], ['@muxui/react/markdown', ['Markdown']]]);
  const audited = (descriptor) => findDescriptorExportProblems(descriptor, exportNames, { packageName: '@muxui/react' });
  assert.deepEqual(audited(sampleDescriptor), []);
  // The right member under the wrong subpath is not an export of that module.
  const crossed = structuredClone(sampleDescriptor);
  crossed.bindings['muxui:component:button#web.react'].export = '@muxui/react/markdown#Button';
  assert.deepEqual(audited(crossed), ['muxui:component:button#web.react: @muxui/react/markdown does not export Button']);
  const absent = structuredClone(sampleDescriptor);
  absent.bindings['muxui:component:button#web.react'].export = '@muxui/react/button#Button';
  assert.deepEqual(audited(absent), ['muxui:component:button#web.react: @muxui/react/button is not an importable module of the package']);
  assert.deepEqual(descriptorExports(sampleDescriptor).map(({ specifier, member }) => `${specifier}#${member}`), ['@muxui/react#Button', '@muxui/react/markdown#Markdown']);
});

test('E-P2.1-02 negative: an export identity needs exactly one #, a plain member, and a module of the package', () => {
  // The installed resolver rejects each of these; the audit may not read past the second segment.
  const exportNames = new Map([['@muxui/react', ['Button']], ['@muxui/schema', ['Button']]]);
  const audited = (identity) => findDescriptorExportProblems({ bindings: { b: { export: identity } } }, exportNames, { packageName: '@muxui/react' });
  assert.deepEqual(audited('@muxui/react#Button'), []);
  assert.deepEqual(audited('@muxui/react#Button#junk'), ['b: @muxui/react#Button#junk is not <specifier>#<Member>']);
  for (const identity of ['@muxui/react', '@muxui/react#', '@muxui/react#Bu tton', '@muxui/react#1Button', '#Button', '@muxui/react#Button#']) {
    assert.equal(audited(identity).length, 1, identity);
    assert.match(audited(identity)[0], /is not <specifier>#<Member>/u, identity);
  }
  // Another package's module does not count, even when it exports the member.
  assert.deepEqual(audited('@muxui/schema#Button'), ['b: @muxui/schema is not @muxui/react or one of its modules']);
  assert.deepEqual(audited('@muxui/reactor#Button'), ['b: @muxui/reactor is not @muxui/react or one of its modules']);
});

test('pack-time provenance is stamped into the generator\'s canonical descriptor and nowhere else', () => {
  const source = readFileSync(resolve(repositoryRoot, 'packages/react/generated/renderer-descriptor.json'), 'utf8');
  const provenance = { releaseId: 'muxui-portfolio:abc', sourceCommit: revision };
  const stamped = stampDescriptorProvenance(source, provenance);
  const descriptor = JSON.parse(stamped);
  assert.deepEqual(descriptor.provenance, provenance);
  assert.equal(stamped, `${canonicalJson(descriptor)}\n`);
  assert.deepEqual({ ...descriptor, provenance: undefined }, { ...JSON.parse(source), provenance: undefined });
  assert.throws(() => stampDescriptorProvenance(stamped, provenance), /P2_1_DESCRIPTOR_STAMP_INVALID/u);
  assert.throws(() => stampDescriptorProvenance(JSON.stringify(JSON.parse(source), null, 2), provenance), /P2_1_DESCRIPTOR_STAMP_INVALID/u);
});
