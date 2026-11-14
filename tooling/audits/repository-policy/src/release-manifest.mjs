// The portfolio release manifest (`E-P2.1-03`): one document per release that correlates the whole tuple of the
// publish set, and the verifier that holds it to the tarball bytes. Both read the same facts from the tarballs, so
// the builder cannot record something the verifier would read differently. Builtins only: the lineage check runs in
// a job that installs nothing.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.mjs';
import { readArchive } from './release-archive.mjs';
import { deriveCatalogIdentity, deriveVisualContract, digestFileSet, readLockedIntegrity } from './release-contract.mjs';
import { CANDIDATE_PUBLISH_CONFIG, descriptorExports, isPackageSpecifier } from './release-package.mjs';
import { nextCandidateVersion, tarballFileName } from './release-set.mjs';

export const PORTFOLIO_SCHEMA = 'muxui-portfolio-release-v1';
export const REACT_COMPATIBILITY_SCHEMA = 'muxui-react-compatibility-v1';
const RENDERER_PACKAGE = '@muxui/react';
const RENDERER_BINDING = 'web.react';
const SCHEMA_PACKAGE = '@muxui/schema';
const CATALOG_PACKAGE = '@muxui/catalog';
/** The retained evidence a release is bound to: the CI evidence of these milestones and the retroactive review index. */
export const RETAINED_EVIDENCE_MILESTONES = Object.freeze(['R1.1', 'R1.2', 'R1.3', 'R1.4', 'R1.5']);
export const RETAINED_REVIEW_INDEX = 'tests/evidence/r1-retro-review/index.json';
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


/**
 * Problems in a renderer descriptor against the catalog's release record for it and the package's own export map
 * (what the installed resolver would reject). A binding's export identity is `<package>[/<subpath>]#<Member>`, with
 * one `#`, and its module is the package or a public subpath of its export map.
 */
export function findReactCompatibilityProblems({ descriptor, catalogPackage, version, packageExports }) {
  const problems = [];
  const record = catalogPackage.releaseManifest;
  if (descriptor.package !== RENDERER_PACKAGE || descriptor.version !== version) problems.push(`descriptor is ${descriptor.package}@${descriptor.version}, not ${RENDERER_PACKAGE}@${version}`);
  if (!caretAllows(descriptor.bindingSchemaRange, record.schemaVersion)) problems.push(`schema range ${descriptor.bindingSchemaRange} does not admit ${record.schemaVersion}`);
  if (!caretAllows(descriptor.tokenContractRange, record.tokenContractVersion)) problems.push(`token range ${descriptor.tokenContractRange} does not admit ${record.tokenContractVersion}`);
  const publicModules = new Set(Object.keys(packageExports ?? {}).filter((key) => !key.includes('*')).map((key) => (key === '.' ? RENDERER_PACKAGE : `${RENDERER_PACKAGE}/${key.slice(2)}`)));
  const identities = new Map(descriptorExports(descriptor).map((entry) => [entry.binding, entry]));
  for (const { binding, identity, specifier, valid } of identities.values()) {
    if (!valid || !isPackageSpecifier(specifier, RENDERER_PACKAGE) || !publicModules.has(specifier)) {
      problems.push(`${binding} export ${identity} is not a public ${RENDERER_PACKAGE} module and one member`);
    }
  }
  for (const binding of record.bindings.filter(({ package: owner }) => owner === RENDERER_PACKAGE)) {
    const declared = descriptor.bindings?.[binding.binding];
    if (declared === undefined) {
      problems.push(`${binding.binding} is in the catalog and not in the descriptor`);
      continue;
    }
    if (declared.specRevision !== binding.specRevision) problems.push(`${binding.binding} spec revision differs`);
    if (canonicalJson(declared.tokenRequirementSetDigests) !== canonicalJson(binding.tokenRequirementSetDigests)) problems.push(`${binding.binding} token requirement digests differ`);
    if (canonicalJson(declared.platformSafetyRequirementSetDigests) !== canonicalJson(binding.platformSafetyRequirementSetDigests)) problems.push(`${binding.binding} platform-safety digests differ`);
    if (identities.get(binding.binding)?.member !== binding.exportName) problems.push(`${binding.binding} export is not ${binding.exportName}`);
    if (!caretAllows(binding.versionRange, version)) problems.push(`${binding.binding} range ${binding.versionRange} does not admit ${version}`);
  }
  return problems;
}

/** Reads a file as committed at `revision`, or undefined when that commit has no such file. */
export function committedFileReader(revision, cwd) {
  return (path) => {
    try {
      return execFileSync('git', ['show', `${revision}:${path}`], { cwd, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return undefined;
    }
  };
}

/**
 * The release ledger: the manifest of each portfolio release a later release names or reuses from, byte for byte as
 * the release wrote it, at `releases/<hex>.json` for the release id `muxui-portfolio:<hex>`. One path per id, so a
 * ledger cannot hold two manifests of one release.
 */
export const RELEASE_LEDGER = 'releases';
const ledgerName = /^releases\/([0-9a-f]{32})\.json$/u;
const releaseIdHex = /^muxui-portfolio:([0-9a-f]{32})$/u;

/** The ledger path of a release id, or undefined for a string that is not one. */
export const releaseLedgerPath = (id) => {
  const hex = releaseIdHex.exec(typeof id === 'string' ? id : '')?.[1];
  return hex === undefined ? undefined : `${RELEASE_LEDGER}/${hex}.json`;
};

/**
 * The ledger manifest at `path` as committed at `revision`: a portfolio manifest whose id is the one its file name
 * gives. An uncommitted edit is not read, and a missing file, another path, or a mismatched manifest stops the release.
 */
export function readLedgerManifest({ path, revision, cwd }) {
  const hex = ledgerName.exec(path)?.[1] ?? fail('P2_1_RELEASE_LEDGER_PATH_INVALID', `${path} is not ${RELEASE_LEDGER}/<hex of a release id>.json`);
  const bytes = committedFileReader(revision, cwd)(path) ?? fail('P2_1_RELEASE_LEDGER_MISSING', `${path} is not committed at ${revision}`);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('P2_1_RELEASE_LEDGER_MISMATCH', `${path} is not JSON`);
  }
  if (manifest?.schema !== PORTFOLIO_SCHEMA || manifest.id !== `muxui-portfolio:${hex}`) {
    fail('P2_1_RELEASE_LEDGER_MISMATCH', `${path} is not the ${PORTFOLIO_SCHEMA} manifest of muxui-portfolio:${hex}`);
  }
  return manifest;
}

/**
 * The ledger manifests committed at `revision` for the releases `ids` name: where a reused package's record is checked
 * against the release that published it. A release with no ledger file is absent from the Map, and
 * `verifyPortfolioRelease` then refuses the reuse.
 */
export function readRetainedManifests({ ids, revision, cwd }) {
  const found = new Map();
  const read = committedFileReader(revision, cwd);
  for (const id of new Set(ids)) {
    const path = releaseLedgerPath(id);
    if (path === undefined || read(path) === undefined) continue;
    found.set(id, readLedgerManifest({ path, revision, cwd }));
  }
  return found;
}

/** A file as committed at the release commit; a missing one stops the release. */
function requireCommitted(readCommitted, path) {
  if (typeof readCommitted !== 'function') fail('P2_1_MANIFEST_EVIDENCE_UNVERIFIABLE', 'the committed sources must be readable to build or verify a release');
  return readCommitted(path) ?? fail('P2_1_MANIFEST_EVIDENCE_MISSING', `${path} is not committed at the release commit`);
}

/** The evidence digests of a release: the retained indexes as committed (`readCommitted(path)` returns their bytes). */
export function readEvidenceRecord(readCommitted) {
  const read = (path) => requireCommitted(readCommitted, path);
  const indexPath = (milestone) => `tests/evidence/${milestone.toLowerCase()}/index.json`;
  const review = read(RETAINED_REVIEW_INDEX);
  return {
    capturedCiEvidence: RETAINED_EVIDENCE_MILESTONES.map((milestone) => ({ milestone, path: indexPath(milestone), sha256: sha256(read(indexPath(milestone))) })),
    retainedReviewEvidence: [{ milestones: JSON.parse(review.toString('utf8')).milestones, path: RETAINED_REVIEW_INDEX, sha256: sha256(review) }],
  };
}

// A generated file's `.provenance` sidecar: a header with the sha256 of its body, and a record of the file's path and sha256.
function sidecarProblem(sidecar, expectedPath, fileBytes) {
  const match = /^\/\/ @generated-from: ([^\n]+)\n\/\/ @generated-content-sha256: (sha256:[a-f0-9]{64})\n([\s\S]+)$/u.exec(sidecar?.toString('utf8') ?? '');
  if (!match || sha256(match[3]) !== match[2]) return 'its provenance sidecar is missing or malformed';
  let record;
  try {
    record = JSON.parse(match[3]);
  } catch {
    return 'its provenance sidecar is not JSON';
  }
  return record.path === expectedPath && record.sha256 === sha256(fileBytes) ? null : `its provenance sidecar does not record ${expectedPath} at these bytes`;
}

const profileDigests = (sets, reference) => Object.fromEntries(Object.entries(sets)
  .filter(([key]) => key.startsWith(`${reference}:`))
  .map(([key, digest]) => [key.slice(reference.length + 1), digest]));

/**
 * The catalog the tarball really holds: the bundle recomputes to the digest the package record and its release record
 * declare, both sidecars and the `./bundle` module match their files, and the package and release records agree with the
 * bundle on versions, contracts, requirement sets, and each renderer binding. Returns the parsed package record and bundle.
 */
function readCatalog(files, version) {
  const code = 'P2_1_MANIFEST_CATALOG_INVALID';
  const need = (path) => files.get(`package/generated/${path}`) ?? fail(code, `${CATALOG_PACKAGE} has no generated/${path}`);
  const packageBytes = need('catalog-package.json');
  const bundleBytes = need('catalog.json');
  const moduleText = need('catalog.mjs').toString('utf8');
  for (const [name, bytes] of [['catalog-package.json', packageBytes], ['catalog.json', bundleBytes]]) {
    const problem = sidecarProblem(need(`${name}.provenance`), `packages/catalog/generated/${name}`, bytes);
    if (problem) fail(code, `generated/${name}: ${problem}`);
  }
  const catalogPackage = JSON.parse(packageBytes.toString('utf8'));
  const bundle = JSON.parse(bundleBytes.toString('utf8'));
  const release = catalogPackage.releaseManifest ?? fail(code, 'the catalog package record has no release record');
  const { catalogDigest, ...preimage } = bundle;
  const digest = sha256(canonicalJson(preimage));
  if (catalogDigest !== digest) fail(code, `the bundle digest ${catalogDigest} is not its content's ${digest}`);
  if (!Array.isArray(bundle.artifacts)) fail(code, 'the bundle has no artifacts');
  const wrapped = /^\/\/ @generated-from: [^\n]+\n\/\/ @generated-content-sha256: (sha256:[a-f0-9]{64})\n(export const catalogJson = (".*");\n)$/su.exec(moduleText);
  const token = bundle.artifacts.find(({ kind }) => kind === 'token');
  const agreements = [
    [wrapped !== null && sha256(wrapped[2]) === wrapped[1] && JSON.parse(wrapped[3]) === bundleBytes.toString('utf8').replace(/\n$/u, ''), 'generated/catalog.mjs does not hold the bundle in generated/catalog.json'],
    [catalogPackage.catalogDigest === digest && release.catalog?.digest === digest, 'the package and release records declare another catalog digest'],
    [catalogPackage.name === CATALOG_PACKAGE && catalogPackage.version === version && catalogPackage.catalogVersion === version && bundle.catalogVersion === version && release.catalog.version === version && release.releaseVersion === version,
      `the catalog is not ${version} in the package record, the release record, and the bundle`],
    [release.catalog.id === `${CATALOG_PACKAGE}@${version}:${digest}`, 'the release record names another catalog id'],
    [bundle.sourceRevision === catalogPackage.sourceRevision && release.sourceRevision === bundle.sourceRevision && catalogPackage.provenance?.value === bundle.sourceRevision && release.id === `muxui-release:${version}:${bundle.sourceRevision}`,
      'the source revision or release id differs between the bundle and its records'],
    [catalogPackage.queryApiVersion === bundle.apiVersion && release.queryApiVersion === bundle.apiVersion && canonicalJson(catalogPackage.supportedQueryApiVersions) === canonicalJson(bundle.supportedQueryApiVersions),
      'the query API versions differ between the bundle and its records'],
    [release.schemaVersion === bundle.schemaVersion, 'the release record names another schema version'],
    [token !== undefined && release.tokenContractVersion === token.record.tokenContractVersion, 'the release record names another token contract version'],
    [catalogPackage.platformSafetyContract?.version === bundle.platformSafetyContract?.contractVersion && catalogPackage.platformSafetyContract?.digest === bundle.platformSafetyContractDigest,
      'the platform-safety contract differs between the bundle and the package record'],
  ];
  const problems = agreements.filter(([ok]) => !ok).map(([, text]) => text);

  // The requirement-set maps and renderer bindings are derived from the bundle's component artifacts.
  const components = bundle.artifacts.filter(({ kind }) => kind === 'component');
  const sets = (field) => Object.fromEntries(components.flatMap((artifact) => Object.entries(artifact[field]).map(([key, set]) => [`${artifact.id}#${key}`, set.digest])));
  const tokenSets = sets('tokenRequirementSets');
  const safetySets = sets('platformSafetyRequirementSets');
  if (canonicalJson(catalogPackage.tokenRequirementSets) !== canonicalJson(tokenSets)) problems.push('the package record\'s token requirement sets differ from the bundle\'s');
  if (canonicalJson(catalogPackage.platformSafetyRequirementSets) !== canonicalJson(safetySets)) problems.push('the package record\'s platform-safety requirement sets differ from the bundle\'s');
  const rendered = components.filter(({ platforms }) => platforms.includes(RENDERER_BINDING)).map(({ id }) => `${id}#${RENDERER_BINDING}`).sort();
  if (canonicalJson(release.bindings.map(({ binding }) => binding).sort()) !== canonicalJson(rendered)) problems.push(`the release record does not list exactly the ${RENDERER_BINDING} bindings of the bundle`);
  for (const binding of release.bindings) {
    const artifact = components.find(({ id }) => id === binding.binding.slice(0, binding.binding.indexOf('#')));
    const matches = artifact !== undefined
      && binding.specRevision === artifact.bindingSpecRevisions[RENDERER_BINDING]
      && binding.exportName === artifact.name
      && binding.descriptor === `renderer:${binding.package}`
      && canonicalJson(binding.tokenRequirementSetDigests) === canonicalJson(profileDigests(tokenSets, binding.binding))
      && canonicalJson(binding.platformSafetyRequirementSetDigests) === canonicalJson(profileDigests(safetySets, binding.binding));
    if (!matches) problems.push(`${binding.binding} in the release record is not what the bundle holds`);
  }
  if (problems.length > 0) fail(code, problems.join('; '));
  return { catalogPackage, bundle };
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
  const catalog = packages.get(CATALOG_PACKAGE);
  const { catalogPackage, bundle } = readCatalog(catalog.files, catalog.manifest.version);

  // The contract versions come from the bundle, and the packed schema package must declare the ones it implements.
  const schemaSource = packages.get(SCHEMA_PACKAGE).files.get('package/src/index.mjs')?.toString('utf8') ?? '';
  const declared = (name) => new RegExp(`export const ${name} = '([^']+)';`, 'u').exec(schemaSource)?.[1];
  if (declared('SCHEMA_VERSION') !== bundle.schemaVersion || declared('API_VERSION') !== bundle.apiVersion) {
    fail('P2_1_MANIFEST_CONTRACT_MISMATCH', `${SCHEMA_PACKAGE} declares schema ${declared('SCHEMA_VERSION')} and query API ${declared('API_VERSION')}; the catalog bundle is ${bundle.schemaVersion} and ${bundle.apiVersion}`);
  }
  const contracts = {
    schemaVersion: bundle.schemaVersion,
    queryApiVersion: bundle.apiVersion,
    supportedQueryApiVersions: bundle.supportedQueryApiVersions,
    tokenContractVersion: catalogPackage.releaseManifest.tokenContractVersion,
    platformSafetyContractVersion: bundle.platformSafetyContract.contractVersion,
  };

  // Every renderer the catalog's release record names has a descriptor at the pointer its package declares.
  const descriptors = [];
  for (const [descriptorId, packageName] of new Map(catalogPackage.releaseManifest.bindings.map(({ descriptor, package: owner }) => [descriptor, owner]))) {
    const entry = publishSet.packages.find(({ name }) => name === packageName) ?? fail('P2_1_MANIFEST_PACKAGE_INVALID', `the catalog's renderer ${packageName} is not in the publish set`);
    const { files, manifest } = packages.get(packageName);
    const pointer = manifest.muxUi?.rendererDescriptor;
    if (pointer !== './generated/renderer-descriptor.json') fail('P2_1_MANIFEST_PACKAGE_INVALID', `${packageName} points at ${JSON.stringify(pointer)}, not ./generated/renderer-descriptor.json`);
    const path = `package/${pointer.slice(2)}`;
    const bytes = files.get(path) ?? fail('P2_1_MANIFEST_PACKAGE_INVALID', `${packageName} has no ${path}`);
    const problem = sidecarProblem(files.get(`${path}.provenance`), `${entry.path}/${pointer.slice(2)}`, bytes);
    if (problem) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${packageName} ${pointer}: ${problem}`);
    const descriptor = JSON.parse(bytes.toString('utf8'));
    if (descriptor.id !== descriptorId || descriptor.package !== packageName) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${packageName} descriptor is ${descriptor.id} for ${descriptor.package}, not ${descriptorId} for ${packageName}`);
    descriptors.push({ id: descriptor.id, package: packageName, version: manifest.version, path: path.slice('package/'.length), digest: sha256(bytes), bindings: Object.keys(descriptor.bindings ?? {}).length, descriptor });
  }

  const renderer = packages.get(RENDERER_PACKAGE);
  const profileBytes = renderer.files.get('package/generated/compatibility.mjs');
  if (profileBytes === undefined || !profileBytes.toString('utf8').includes(`"schema":"${REACT_COMPATIBILITY_SCHEMA}"`)) {
    fail('P2_1_MANIFEST_PACKAGE_INVALID', `${RENDERER_PACKAGE} has no ${REACT_COMPATIBILITY_SCHEMA} compatibility profile`);
  }
  const exceptions = JSON.parse(renderer.files.get('package/generated/release.json')?.toString('utf8') ?? 'null')?.exceptions;
  if (!Array.isArray(exceptions)) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${RENDERER_PACKAGE} has no generated/release.json with its exceptions`);
  return {
    packages,
    catalogPackage,
    bundle,
    contracts,
    descriptors,
    exceptionDigests: exceptions.map((exception) => sha256(canonicalJson(exception))),
    reactCompatibility: { schema: REACT_COMPATIBILITY_SCHEMA, path: 'generated/compatibility.mjs', digest: sha256(profileBytes) },
  };
}

/**
 * The React renderer's correlation with the repository, recomputed rather than trusted: the lockfile and token source as
 * committed at the release commit, the packed generated outputs, the catalog, token and binding-spec identities of the
 * packed catalog, and the icon visual contract (the Lucide version and its locked integrity, the packed modules that
 * import it, and the packed stylesheets). The release's source commit and tree are the manifest's own `source`.
 */
function deriveReactCorrelation(facts, readCommitted) {
  const code = 'P2_1_MANIFEST_REACT_INVALID';
  const { files, manifest } = facts.packages.get(RENDERER_PACKAGE);
  const release = JSON.parse(files.get('package/generated/release.json')?.toString('utf8') ?? 'null');
  if (!Array.isArray(release?.componentExports)) fail(code, `${RENDERER_PACKAGE} has no generated/release.json with its component exports`);
  const lockfile = requireCommitted(readCommitted, 'pnpm-lock.yaml');
  const lucideVersion = manifest.dependencies?.['lucide-react'];
  const generated = [...files]
    .filter(([path]) => path.startsWith('package/generated/'))
    .map(([path, bytes]) => ({ path: path.slice('package/'.length), bytes }));
  return {
    lockfile: { path: 'pnpm-lock.yaml', sha256: sha256(lockfile) },
    generatedOutputs: digestFileSet(generated, code),
    ...deriveCatalogIdentity({ catalogPackage: facts.catalogPackage, catalogBundle: facts.bundle, bindings: release.componentExports.map(({ binding }) => binding) }, code),
    visualContract: deriveVisualContract({
      tokenSource: { path: 'catalog/tokens/default-theme.json', bytes: requireCommitted(readCommitted, 'catalog/tokens/default-theme.json') },
      stylesheets: generated.filter(({ path }) => path.endsWith('.css')),
      lucide: { version: lucideVersion, integrity: readLockedIntegrity(lockfile.toString('utf8'), 'lucide-react', lucideVersion ?? '') },
      modules: generated.filter(({ path }) => /\.m?js$/u.test(path)),
    }),
  };
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

const buildPublication = ({ published }) => ({
  status: 'prepared',
  registry: CANDIDATE_PUBLISH_CONFIG.registry,
  distTag: CANDIDATE_PUBLISH_CONFIG.tag,
  order: published.map(({ name }) => name),
  authorization: 'required-external-human-authorization',
  provenance: 'required-at-publication',
  mutationPerformed: false,
});

// A manifest's digest covers everything except the digest itself and how the checks ran.
function manifestDigest(manifest) {
  const { digest: _digest, preparation: _preparation, ...body } = manifest;
  return sha256(canonicalJson(body));
}

/**
 * The portfolio manifest. `artifacts` maps every member of the set to its tarball bytes. `reused` maps a package the
 * release does not publish to its package record in the manifest that published it; the bytes must be the ones that
 * record names, and the new record keeps its version, digests, and provenance. `readCommitted(path)` reads the
 * retained evidence indexes, the lockfile and the token source as committed at the release commit. A published React
 * package brings its `react` correlation block, derived here; a reused one keeps the record of its own release.
 * `preparation` says how the checks ran and is not part of the digest, so two preparations of one commit and tuple have
 * one digest whatever the run was.
 */
export function buildPortfolioManifest({ publishSet, artifacts, reused = new Map(), source, readCommitted, preparation }) {
  const facts = readTupleFacts({ publishSet, artifacts });
  const versionOf = (name) => facts.packages.get(name).manifest.version;
  for (const [name, prior] of reused) {
    const { bytes, manifest } = facts.packages.get(name);
    if (prior.name !== name || prior.version !== manifest.version || prior.file !== tarballFileName(name, manifest.version)
      || prior.integrity !== sha512Integrity(bytes) || prior.sha256 !== sha256(bytes) || manifest.gitHead !== prior.provenance?.sourceCommit) {
      fail('P2_1_MANIFEST_REUSE_MISMATCH', `${name} is not the package its earlier release recorded (${prior.version}, ${prior.integrity})`);
    }
  }
  const published = publishSet.packages.filter(({ name }) => !reused.has(name)).map(({ name }) => ({ name, version: versionOf(name) }));
  const id = releaseIdFor({ revision: source.revision, published });
  const body = {
    schema: PORTFOLIO_SCHEMA,
    id,
    source: { revision: source.revision, tree: source.tree },
    packages: publishSet.packages.map(({ name }) => {
      const { bytes, manifest } = facts.packages.get(name);
      if (reused.has(name)) return { ...reused.get(name), role: 'reused' };
      return {
        name,
        version: manifest.version,
        role: 'published',
        file: tarballFileName(name, manifest.version),
        integrity: sha512Integrity(bytes),
        sha256: sha256(bytes),
        provenance: { kind: 'release-commit', releaseId: id, sourceCommit: source.revision },
      };
    }),
    catalog: {
      id: facts.catalogPackage.releaseManifest.catalog.id,
      version: facts.catalogPackage.catalogVersion,
      digest: facts.catalogPackage.catalogDigest,
    },
    contracts: facts.contracts,
    compatibility: { edges: tupleEdges(publishSet, facts) },
    descriptors: facts.descriptors.map(({ descriptor: _descriptor, ...record }) => record),
    reactCompatibility: facts.reactCompatibility,
    ...(reused.has(RENDERER_PACKAGE) ? {} : { react: deriveReactCorrelation(facts, readCommitted) }),
    evidence: { ...readEvidenceRecord(readCommitted), activeExceptions: facts.exceptionDigests },
    publication: buildPublication({ published }),
    rollback: buildRollbackPlan({ published }),
  };
  return { ...body, digest: sha256(canonicalJson(body)), preparation };
}

/**
 * Verifies a portfolio manifest against the tarballs of its tuple (`artifacts`: package name to bytes, the
 * published ones from the candidate and a reused one from where it was first published). It rejects repacked bytes
 * under one version, a package missing from the tuple, a published package built from another commit, and a reused
 * package that is not exactly the record of the earlier release it names (`priorManifests`: release id to that
 * release's manifest) or whose compatibility no longer holds. Contracts, evidence, exceptions, rollback, and
 * publication are recomputed, not trusted: from the packed catalog, schema, and renderer, from the retained
 * evidence, lockfile and token source as committed (`readCommitted`), and from the verified records. The `react`
 * correlation is recomputed for a published React package and absent for a reused one. `expected` may name the commit and tree the
 * release must come from. Returns the facts read from the tarballs.
 */
export function verifyPortfolioRelease({ manifest, artifacts, publishSet, expected = {}, readCommitted, priorManifests = new Map() }) {
  if (manifest?.schema !== PORTFOLIO_SCHEMA) fail('P2_1_MANIFEST_SCHEMA_INVALID', `the manifest schema is ${manifest?.schema}`);
  if (manifest.digest !== manifestDigest(manifest)) fail('P2_1_MANIFEST_DIGEST_MISMATCH', 'the manifest digest does not match its content');
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
    if (record.role !== 'reused') continue;
    if (record.provenance.releaseId === manifest.id) fail('P2_1_MANIFEST_PACKAGE_INVALID', `${name} is reused and records this release as its origin`);
    // A reused package is the record of the release that published it, byte for byte and field for field.
    const origin = priorManifests.get(record.provenance.releaseId);
    if (origin === undefined || origin.schema !== PORTFOLIO_SCHEMA || origin.id !== record.provenance.releaseId || origin.digest !== manifestDigest(origin)) {
      fail('P2_1_MANIFEST_REUSE_UNVERIFIED', `${name} is reused from ${record.provenance.releaseId}, which has no verified earlier manifest`);
    }
    const earlier = (origin.packages ?? []).find((candidate) => candidate.name === name && candidate.role === 'published');
    if (earlier === undefined || canonicalJson({ ...record, role: 'published' }) !== canonicalJson(earlier)) {
      fail('P2_1_MANIFEST_REUSE_MISMATCH', `${name}@${record.version} is not the record ${origin.id} published (${earlier?.version}, ${earlier?.integrity})`);
    }
    // The commit the registry's attestation names is the record's sourceCommit, so it must be the commit the origin release is for.
    if (origin.source?.revision !== record.provenance.sourceCommit) {
      fail('P2_1_MANIFEST_REUSE_MISMATCH', `${name}@${record.version} is built from ${record.provenance.sourceCommit}, and ${origin.id} is for ${origin.source?.revision}`);
    }
  }

  // Compatibility: every sibling edge admits the tuple's version, and the renderer descriptor matches the catalog's
  // release record and its own package's export map.
  const edges = tupleEdges(publishSet, facts);
  for (const edge of edges) {
    if (!caretAllows(edge.range, edge.version)) fail('P2_1_MANIFEST_COMPATIBILITY_BROKEN', `${edge.from} requires ${edge.to}@${edge.range}, and the tuple has ${edge.version}`);
  }
  const { catalogPackage } = facts;
  for (const descriptor of facts.descriptors) {
    const problems = findReactCompatibilityProblems({
      descriptor: descriptor.descriptor, catalogPackage, version: descriptor.version, packageExports: facts.packages.get(descriptor.package).manifest.exports,
    });
    if (problems.length > 0) fail('P2_1_MANIFEST_COMPATIBILITY_BROKEN', `${descriptor.package}: ${problems.join('; ')}`);
    const provenance = descriptor.descriptor.provenance;
    const owner = recorded.get(descriptor.package).provenance;
    if (provenance !== undefined && (provenance.releaseId !== owner.releaseId || provenance.sourceCommit !== owner.sourceCommit)) {
      fail('P2_1_MANIFEST_COMMIT_MISMATCH', `${descriptor.package} descriptor records ${provenance.sourceCommit}, not ${owner.sourceCommit}`);
    }
  }

  // Everything else the manifest records is recomputed from the same bytes, the committed evidence, and the records above.
  const recomputed = {
    catalog: { id: catalogPackage.releaseManifest.catalog.id, version: catalogPackage.catalogVersion, digest: catalogPackage.catalogDigest },
    contracts: facts.contracts,
    compatibility: { edges },
    descriptors: facts.descriptors.map(({ descriptor: _descriptor, ...record }) => record),
    reactCompatibility: facts.reactCompatibility,
    react: recorded.get(RENDERER_PACKAGE).role === 'published' ? deriveReactCorrelation(facts, readCommitted) : null,
    evidence: { ...readEvidenceRecord(readCommitted), activeExceptions: facts.exceptionDigests },
    publication: buildPublication({ published }),
    rollback: buildRollbackPlan({ published }),
  };
  for (const [key, value] of Object.entries(recomputed)) {
    if (canonicalJson(manifest[key] ?? null) !== canonicalJson(value)) fail('P2_1_MANIFEST_RECORD_MISMATCH', `the recorded ${key} is not what the tarballs and the committed sources hold`);
  }
  return facts;
}
