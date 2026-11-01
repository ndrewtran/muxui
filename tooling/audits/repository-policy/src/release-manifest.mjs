// The portfolio release manifest (`E-P2.1-03`): one document per release that correlates the whole tuple of the
// publish set, and the verifier that holds it to the tarball bytes. Both read the same facts from the tarballs, so
// the builder cannot record something the verifier would read differently. Builtins only: the lineage check runs in
// a job that installs nothing.
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.mjs';
import { readArchive } from './release-archive.mjs';
import { CANDIDATE_PUBLISH_CONFIG, descriptorExports } from './release-package.mjs';
import { nextCandidateVersion, tarballFileName } from './release-set.mjs';

export const PORTFOLIO_SCHEMA = 'muxui-portfolio-release-v1';
export const REACT_COMPATIBILITY_SCHEMA = 'muxui-react-compatibility-v1';
const RENDERER_PACKAGE = '@muxui/react';
const gitObject = /^[0-9a-f]{40}$/u;

export const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const sha512Integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

// A caret range on a semantic version, with node-semver's prerelease rule: a prerelease satisfies it only when the
// range names a prerelease of the same base version. Only the ranges a release records are supported, and the
// tests hold this to the semver package.
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(version ?? '');
  if (!match) fail('P2_1_VERSION_UNSUPPORTED', `${JSON.stringify(version)} is not a semantic version`);
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? [] };
}

function compareIdentifiers(left, right) {
  const numeric = (value) => /^\d+$/u.test(value);
  if (numeric(left) && numeric(right)) return Math.sign(Number(left) - Number(right));
  if (numeric(left) !== numeric(right)) return numeric(left) ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return Math.sign(left.core[index] - right.core[index]);
  }
  if (left.pre.length === 0 || right.pre.length === 0) return Math.sign(right.pre.length - left.pre.length);
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    if (left.pre[index] === undefined) return -1;
    if (right.pre[index] === undefined) return 1;
    const order = compareIdentifiers(left.pre[index], right.pre[index]);
    if (order !== 0) return order;
  }
  return 0;
}

/** Whether `version` satisfies `range`: `^X.Y.Z[-pre]` (node-semver caret semantics) or one exact version. */
export function caretAllows(range, version) {
  const candidate = parseVersion(version);
  const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(range ?? '');
  const caret = /^\^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u.exec(range ?? '');
  if (exact) return compareVersions(parseVersion(range), candidate) === 0;
  if (!caret) fail('P2_1_RANGE_UNSUPPORTED', `${JSON.stringify(range)} is not a caret range or an exact version`);
  const lower = parseVersion(caret[1]);
  const [majorPart, minorPart, patchPart] = lower.core;
  const upper = { core: majorPart > 0 ? [majorPart + 1, 0, 0] : minorPart > 0 ? [0, minorPart + 1, 0] : [0, 0, patchPart + 1], pre: ['0'] };
  if (compareVersions(candidate, lower) < 0 || compareVersions(candidate, upper) >= 0) return false;
  return candidate.pre.length === 0 || (lower.pre.length > 0 && candidate.core.every((part, index) => part === lower.core[index]));
}

/** The release id: one commit and the exact versions it publishes name one release. */
export function releaseIdFor({ revision, published }) {
  const identity = canonicalJson({ revision, published: published.map(({ name, version }) => ({ name, version })).sort((left, right) => (left.name < right.name ? -1 : 1)) });
  return `muxui-portfolio:${sha256(identity).slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

const catalogPackagePath = 'package/generated/catalog-package.json';

/** Problems in a renderer descriptor against the catalog's release record for it (what the resolver would reject). */
export function findReactCompatibilityProblems({ descriptor, catalogPackage, version }) {
  const problems = [];
  const record = catalogPackage.releaseManifest;
  if (descriptor.package !== RENDERER_PACKAGE || descriptor.version !== version) problems.push(`descriptor is ${descriptor.package}@${descriptor.version}, not ${RENDERER_PACKAGE}@${version}`);
  if (!caretAllows(descriptor.bindingSchemaRange, record.schemaVersion)) problems.push(`schema range ${descriptor.bindingSchemaRange} does not admit ${record.schemaVersion}`);
  if (!caretAllows(descriptor.tokenContractRange, record.tokenContractVersion)) problems.push(`token range ${descriptor.tokenContractRange} does not admit ${record.tokenContractVersion}`);
  const exports = new Map(descriptorExports(descriptor).map((entry) => [entry.binding, entry]));
  for (const binding of record.bindings.filter(({ package: owner }) => owner === RENDERER_PACKAGE)) {
    const declared = descriptor.bindings?.[binding.binding];
    if (declared === undefined) {
      problems.push(`${binding.binding} is in the catalog and not in the descriptor`);
      continue;
    }
    if (declared.specRevision !== binding.specRevision) problems.push(`${binding.binding} spec revision differs`);
    if (canonicalJson(declared.tokenRequirementSetDigests) !== canonicalJson(binding.tokenRequirementSetDigests)) problems.push(`${binding.binding} token requirement digests differ`);
    if (canonicalJson(declared.platformSafetyRequirementSetDigests) !== canonicalJson(binding.platformSafetyRequirementSetDigests)) problems.push(`${binding.binding} platform-safety digests differ`);
    if (exports.get(binding.binding)?.member !== binding.exportName) problems.push(`${binding.binding} export is not ${binding.exportName}`);
    if (!caretAllows(binding.versionRange, version)) problems.push(`${binding.binding} range ${binding.versionRange} does not admit ${version}`);
  }
  return problems;
}

/** The facts the manifest records, read from the tarballs of the tuple (`artifacts`: package name to bytes). */
export function readTupleFacts({ publishSet, artifacts }) {
  const packages = new Map();
  for (const { name } of publishSet.packages) {
    const bytes = artifacts.get(name);
    if (bytes === undefined) fail('P2_1_MANIFEST_PACKAGE_MISSING', `${name} has no tarball in the tuple`);
    const files = readArchive(bytes);
    const manifestBytes = files.get('package/package.json');
    if (manifestBytes === undefined) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${name} has no package/package.json`);
    packages.set(name, { bytes, files, manifest: JSON.parse(manifestBytes.toString('utf8')) });
  }
  const catalog = packages.get('@muxui/catalog');
  const catalogBytes = catalog?.files.get(catalogPackagePath);
  if (catalogBytes === undefined) fail('P2_1_MANIFEST_PACKAGE_INVALID', `@muxui/catalog has no ${catalogPackagePath}`);
  const catalogPackage = JSON.parse(catalogBytes.toString('utf8'));
  const descriptors = [];
  for (const { name } of publishSet.packages) {
    const { files, manifest } = packages.get(name);
    const pointer = manifest.muxUi?.rendererDescriptor;
    if (pointer === undefined) continue;
    const path = `package/${pointer.replace(/^\.\//u, '')}`;
    const bytes = files.get(path) ?? fail('P2_1_MANIFEST_PACKAGE_INVALID', `${name} has no ${path}`);
    const descriptor = JSON.parse(bytes.toString('utf8'));
    descriptors.push({ id: descriptor.id, package: name, version: manifest.version, path: path.slice('package/'.length), digest: sha256(bytes), bindings: Object.keys(descriptor.bindings ?? {}).length, descriptor });
  }
  const profileBytes = packages.get(RENDERER_PACKAGE)?.files.get('package/generated/compatibility.mjs');
  if (profileBytes === undefined || !profileBytes.toString('utf8').includes(`"schema":"${REACT_COMPATIBILITY_SCHEMA}"`)) {
    fail('P2_1_MANIFEST_PACKAGE_INVALID', `${RENDERER_PACKAGE} has no ${REACT_COMPATIBILITY_SCHEMA} compatibility profile`);
  }
  return { packages, catalogPackage, descriptors, reactCompatibility: { schema: REACT_COMPATIBILITY_SCHEMA, path: 'generated/compatibility.mjs', digest: sha256(profileBytes) } };
}

// Every dependency edge between members of the tuple, as the tarballs declare it.
function tupleEdges(publishSet, facts) {
  const versions = new Map([...facts.packages].map(([name, { manifest }]) => [name, manifest.version]));
  return publishSet.packages.flatMap(({ name }) => Object.entries(facts.packages.get(name).manifest.dependencies ?? {})
    .filter(([dependency]) => versions.has(dependency))
    .map(([dependency, range]) => ({ from: name, to: dependency, range, version: versions.get(dependency) })))
    .sort((left, right) => (`${left.from}>${left.to}` < `${right.from}>${right.to}` ? -1 : 1));
}

/** Decision 0023 and its amendment 01, per package of the release (Decision 0032 item 9). */
export function buildRollbackPlan({ published }) {
  return {
    status: 'prepared-not-exercised',
    authority: ['muxui:decision:0023', 'muxui:decision:0023:amendment:01', 'muxui:decision:0032'],
    distTag: 'next',
    publishOrder: published.map(({ name }) => name),
    packages: published.map(({ name, version }) => ({ name, version, fixForward: nextCandidateVersion(version) })),
    trigger: ['published consumer verification failure', 'integrity or provenance mismatch of one package', 'a later package in the order failing to publish or read back'],
    steps: [
      'stop further publication and preserve every published version and this manifest',
      'deprecate only a version that published bad bytes, with Andrew\'s separate explicit authorization, naming the failure and its fixed successor; a package that never published needs no deprecation, and healthy published versions stay published',
      'fix forward by publishing the corrected rc of the failed package, and of any package that depends on it, to next in publish order through a separately authorized publication',
      'verify the tuple again against a new release manifest; no record is rewritten',
      'latest is not claimed or promoted (the registry sets it on a package\'s first publish); re-pointing it is only the Decision 0023 item 3 rollback step, with Andrew\'s explicit authorization at the time',
    ],
    forbidden: [
      'overwrite or republish a published version',
      'unpublish, except for a security or legal problem inside the npm 72-hour no-dependents window with explicit human authorization',
      'claim or promote latest or a stable release',
      'rewrite an earlier release manifest or evidence record',
    ],
  };
}

/**
 * The portfolio manifest. `artifacts` maps every member of the set to its tarball bytes; `reused` maps a package the
 * release does not publish to the provenance recorded when it was published. `preparation` says how the checks ran
 * and is not part of the digest, so two preparations of one commit and tuple have one digest whatever the run was.
 */
export function buildPortfolioManifest({ publishSet, artifacts, reused = new Map(), source, evidence, react, preparation }) {
  const facts = readTupleFacts({ publishSet, artifacts });
  const versionOf = (name) => facts.packages.get(name).manifest.version;
  const published = publishSet.packages.filter(({ name }) => !reused.has(name)).map(({ name }) => ({ name, version: versionOf(name) }));
  const id = releaseIdFor({ revision: source.revision, published });
  const body = {
    schema: PORTFOLIO_SCHEMA,
    id,
    source: { revision: source.revision, tree: source.tree },
    packages: publishSet.packages.map(({ name }) => {
      const { bytes, manifest } = facts.packages.get(name);
      return {
        name,
        version: manifest.version,
        role: reused.has(name) ? 'reused' : 'published',
        file: tarballFileName(name, manifest.version),
        integrity: sha512Integrity(bytes),
        sha256: sha256(bytes),
        provenance: reused.get(name) ?? { kind: 'release-commit', releaseId: id, sourceCommit: source.revision },
      };
    }),
    catalog: {
      id: facts.catalogPackage.releaseManifest.catalog.id,
      version: facts.catalogPackage.catalogVersion,
      digest: facts.catalogPackage.catalogDigest,
    },
    contracts: {
      schemaVersion: facts.catalogPackage.releaseManifest.schemaVersion,
      queryApiVersion: facts.catalogPackage.queryApiVersion,
      supportedQueryApiVersions: facts.catalogPackage.supportedQueryApiVersions,
      tokenContractVersion: facts.catalogPackage.releaseManifest.tokenContractVersion,
      platformSafetyContractVersion: facts.catalogPackage.platformSafetyContract.version,
    },
    compatibility: { edges: tupleEdges(publishSet, facts) },
    descriptors: facts.descriptors.map(({ descriptor: _descriptor, ...record }) => record),
    reactCompatibility: facts.reactCompatibility,
    react,
    evidence,
    publication: {
      status: 'prepared',
      registry: CANDIDATE_PUBLISH_CONFIG.registry,
      distTag: CANDIDATE_PUBLISH_CONFIG.tag,
      order: published.map(({ name }) => name),
      authorization: 'required-external-human-authorization',
      provenance: 'required-at-publication',
      mutationPerformed: false,
    },
    rollback: buildRollbackPlan({ published }),
  };
  return { ...body, digest: sha256(canonicalJson(body)), preparation };
}

/**
 * Verifies a portfolio manifest against the tarballs of its tuple (`artifacts`: package name to bytes, the
 * published ones from the candidate and a reused one from where it was first published). It rejects repacked bytes
 * under one version, a package missing from the tuple, a published package built from another commit, and a reused
 * package whose recorded digest or compatibility does not hold. `expected` may name the commit and tree the release
 * must come from. Returns the facts read from the tarballs.
 */
export function verifyPortfolioRelease({ manifest, artifacts, publishSet, expected = {} }) {
  if (manifest?.schema !== PORTFOLIO_SCHEMA) fail('P2_1_MANIFEST_SCHEMA_INVALID', `the manifest schema is ${manifest?.schema}`);
  const { digest, preparation: _preparation, ...body } = manifest;
  if (digest !== sha256(canonicalJson(body))) fail('P2_1_MANIFEST_DIGEST_MISMATCH', 'the manifest digest does not match its content');
  if (!gitObject.test(manifest.source?.revision ?? '') || !gitObject.test(manifest.source?.tree ?? '')) fail('P2_1_MANIFEST_SOURCE_INVALID', 'the source revision and tree must be Git object ids');
  for (const key of ['revision', 'tree']) {
    if (expected[key] !== undefined && manifest.source[key] !== expected[key]) fail('P2_1_MANIFEST_SOURCE_MISMATCH', `the manifest source ${key} is ${manifest.source[key]}, not ${expected[key]}`);
  }

  const recorded = new Map((manifest.packages ?? []).map((record) => [record.name, record]));
  const missing = publishSet.packages.filter(({ name }) => !recorded.has(name) || !artifacts.has(name)).map(({ name }) => name);
  if (missing.length > 0) fail('P2_1_MANIFEST_PACKAGE_MISSING', `the tuple has no ${missing.join(', ')}`);
  if (canonicalJson([...recorded.keys()]) !== canonicalJson(publishSet.packages.map(({ name }) => name))) {
    fail('P2_1_MANIFEST_PACKAGE_UNEXPECTED', `the manifest lists ${[...recorded.keys()].join(', ')}, not the publish set in order`);
  }

  const facts = readTupleFacts({ publishSet, artifacts });
  const published = [];
  for (const { name } of publishSet.packages) {
    const record = recorded.get(name);
    const { bytes, manifest: packed } = facts.packages.get(name);
    if (sha512Integrity(bytes) !== record.integrity || sha256(bytes) !== record.sha256) {
      fail('P2_1_MANIFEST_PACKAGE_REPACKED', `${name}@${record.version} is not the recorded bytes (${sha512Integrity(bytes)})`);
    }
    if (packed.name !== name || packed.version !== record.version) fail('P2_1_MANIFEST_PACKAGE_REPACKED', `${name} packs ${packed.name}@${packed.version}, not ${record.version}`);
    const { sourceCommit } = record.provenance ?? {};
    if (!gitObject.test(sourceCommit ?? '') || packed.gitHead !== sourceCommit) {
      fail('P2_1_MANIFEST_COMMIT_MISMATCH', `${name} is built from ${packed.gitHead}, not its recorded ${sourceCommit}`);
    }
    if (record.role === 'published') {
      published.push({ name, version: record.version });
      if (sourceCommit !== manifest.source.revision) fail('P2_1_MANIFEST_COMMIT_MISMATCH', `${name} is published from ${sourceCommit}, not the release commit ${manifest.source.revision}`);
    } else if (record.role !== 'reused') {
      fail('P2_1_MANIFEST_PACKAGE_INVALID', `${name} has role ${record.role}`);
    }
  }
  if (releaseIdFor({ revision: manifest.source.revision, published }) !== manifest.id) fail('P2_1_MANIFEST_ID_MISMATCH', 'the release id does not name this commit and the published versions');
  for (const { name } of publishSet.packages) {
    const record = recorded.get(name);
    if (record.role === 'published' && record.provenance.releaseId !== manifest.id) fail('P2_1_MANIFEST_COMMIT_MISMATCH', `${name} records release ${record.provenance.releaseId}, not ${manifest.id}`);
    if (record.role === 'reused' && record.provenance.releaseId === manifest.id) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${name} is reused and records this release as its origin`);
  }

  // Compatibility: every sibling edge admits the tuple's version, the catalog is the recorded one, and the
  // renderer descriptor matches the catalog's release record.
  const edges = tupleEdges(publishSet, facts);
  for (const edge of edges) {
    if (!caretAllows(edge.range, edge.version)) fail('P2_1_MANIFEST_COMPATIBILITY_BROKEN', `${edge.from} requires ${edge.to}@${edge.range}, and the tuple has ${edge.version}`);
  }
  const catalogVersion = facts.packages.get('@muxui/catalog').manifest.version;
  const { catalogPackage } = facts;
  if (catalogPackage.version !== catalogVersion || catalogPackage.catalogVersion !== catalogVersion || catalogPackage.releaseManifest.catalog.version !== catalogVersion) {
    fail('P2_1_MANIFEST_COMPATIBILITY_BROKEN', `the catalog package is ${catalogVersion} and its catalog record is ${catalogPackage.catalogVersion}`);
  }
  for (const descriptor of facts.descriptors) {
    const problems = findReactCompatibilityProblems({ descriptor: descriptor.descriptor, catalogPackage, version: descriptor.version });
    if (problems.length > 0) fail('P2_1_MANIFEST_COMPATIBILITY_BROKEN', `${descriptor.package}: ${problems.join('; ')}`);
    const provenance = descriptor.descriptor.provenance;
    const owner = recorded.get(descriptor.package).provenance;
    if (provenance !== undefined && (provenance.releaseId !== owner.releaseId || provenance.sourceCommit !== owner.sourceCommit)) {
      fail('P2_1_MANIFEST_COMMIT_MISMATCH', `${descriptor.package} descriptor records ${provenance.sourceCommit}, not ${owner.sourceCommit}`);
    }
  }

  // Everything else the manifest records is recomputed from the same bytes.
  const recomputed = {
    catalog: { id: catalogPackage.releaseManifest.catalog.id, version: catalogPackage.catalogVersion, digest: catalogPackage.catalogDigest },
    compatibility: { edges },
    descriptors: facts.descriptors.map(({ descriptor: _descriptor, ...record }) => record),
    reactCompatibility: facts.reactCompatibility,
  };
  for (const [key, value] of Object.entries(recomputed)) {
    if (canonicalJson(manifest[key]) !== canonicalJson(value)) fail('P2_1_MANIFEST_RECORD_MISMATCH', `the recorded ${key} is not what the tarballs hold`);
  }
  for (const key of ['evidence', 'rollback']) {
    if (manifest[key] === undefined || manifest[key] === null) fail('P2_1_MANIFEST_RECORD_MISMATCH', `the manifest has no ${key}`);
  }
  return facts;
}
