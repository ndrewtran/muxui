// What a release compares with and reuses (`E-P2.1-04`): the prior portfolio release it names from the release ledger,
// the records it keeps for the packages it reuses, and the check that its versions move ahead of that release. Which
// packages to publish, and at which versions, is the release's own choice; nothing here classifies the change.
import { execFileSync } from 'node:child_process';
import { posix, relative, resolve, sep } from 'node:path';
import { canonicalJson } from './canonical-json.mjs';
import { PORTFOLIO_SCHEMA, RELEASE_LEDGER, caretAllows, readLedgerManifest, readRetainedManifests, releaseIdFor, sha256 } from './release-manifest.mjs';
import { releaseVersions, reusedNames } from './release-set.mjs';

const SCHEMA_PACKAGE = '@muxui/schema';
const CATALOG_PACKAGE = '@muxui/catalog';
const TOOLING_PACKAGE = '@muxui/tooling';
/** The three packages new in P2.1; each publishes only prereleases (Decision 0032 item 6). */
export const NEW_PACKAGES = Object.freeze([SCHEMA_PACKAGE, CATALOG_PACKAGE, TOOLING_PACKAGE]);
/** The environment a release gives `resolvePriorRelease`: a prior manifest path, or the flag that this is the first release. */
export const PRIOR_RELEASE_VARIABLE = 'MUXUI_PRIOR_RELEASE_MANIFEST';
export const FIRST_RELEASE_VARIABLE = 'MUXUI_FIRST_PORTFOLIO_RELEASE';

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

const same = (left, right) => canonicalJson(left) === canonicalJson(right);

// ---------------------------------------------------------------------------------------------------------------------
// Versions

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(version ?? '');
  if (!match) fail('P2_1_VERSION_UNSUPPORTED', `${JSON.stringify(version)} is not a semantic version`);
  return { core: match.slice(1, 4).map(Number), pre: match[4] };
}

/** Orders two versions as node-semver does: a prerelease sorts below its release, and `rc.N` by N. */
export function compareVersions(left, right) {
  const [a, b] = [parseVersion(left), parseVersion(right)];
  const level = a.core.findIndex((part, index) => part !== b.core[index]);
  if (level !== -1) return Math.sign(a.core[level] - b.core[level]);
  if (a.pre === b.pre) return 0;
  if (a.pre === undefined || b.pre === undefined) return a.pre === undefined ? 1 : -1;
  const [x, y] = [a.pre, b.pre].map((pre) => /^rc\.(\d+)$/u.exec(pre)?.[1]);
  return x !== undefined && y !== undefined ? Math.sign(Number(x) - Number(y)) : Math.sign(a.pre.localeCompare(b.pre));
}

// ---------------------------------------------------------------------------------------------------------------------
// The prior release and the proposed versions

const PORTFOLIO_SCHEMA_PREFIX = 'muxui-portfolio-release-';

/**
 * Problems (strings) in a prior portfolio manifest, judged against the publish set it must inventory in full: the
 * schema (an unknown portfolio version is refused), the source commit, the digest and release id recomputed from its
 * content, every package once and in order with a valid version, valid contract versions, and exactly the publish set's
 * runtime edges, each with a range that admits the recorded version of its target.
 */
export function findPriorManifestProblems(manifest, publishSet) {
  if (manifest?.schema !== PORTFOLIO_SCHEMA) {
    return [typeof manifest?.schema === 'string' && manifest.schema.startsWith(PORTFOLIO_SCHEMA_PREFIX)
      ? `${manifest.schema} is an unknown portfolio release schema version (this tool reads ${PORTFOLIO_SCHEMA})`
      : `it is not a ${PORTFOLIO_SCHEMA} document`];
  }
  const packageNames = publishSet.packages.map(({ name }) => name);
  const problems = [];
  const versionProblem = (version) => {
    try {
      parseVersion(version);
      return null;
    } catch {
      return `${JSON.stringify(version)} is not a semantic version`;
    }
  };
  if (!/^[0-9a-f]{40}$/u.test(manifest.source?.revision ?? '')) problems.push('it records no source commit');
  const { digest, preparation: _preparation, ...body } = manifest;
  if (digest !== sha256(canonicalJson(body))) problems.push('its digest does not match its content');
  const records = Array.isArray(manifest.packages) ? manifest.packages : [];
  if (!same(records.map(({ name }) => name), packageNames)) problems.push(`it lists ${records.map(({ name }) => name).join(', ') || 'no packages'}, not the publish set ${packageNames.join(', ')} in order`);
  for (const { name, version, role } of records) {
    const bad = versionProblem(version);
    if (bad) problems.push(`${name}: ${bad}`);
    if (!['published', 'reused'].includes(role)) problems.push(`${name} has role ${JSON.stringify(role)}`);
  }
  for (const key of ['schemaVersion', 'queryApiVersion', 'tokenContractVersion']) {
    const bad = versionProblem(manifest.contracts?.[key]);
    if (bad) problems.push(`contracts.${key}: ${bad}`);
  }
  if (problems.length === 0 && manifest.id !== releaseIdFor({ revision: manifest.source.revision, published: records.filter(({ role }) => role === 'published') })) {
    problems.push('its release id does not name its commit and published versions');
  }
  const recorded = new Map(records.map(({ name, version }) => [name, version]));
  const edges = Array.isArray(manifest.compatibility?.edges) ? manifest.compatibility.edges : [];
  const expected = publishSet.packages.flatMap(({ name, runtimeEdges }) => runtimeEdges.map((to) => `${name} > ${to}`));
  const actual = edges.map((edge) => `${edge?.from} > ${edge?.to}`);
  if (!same([...actual].sort(), [...expected].sort())) problems.push(`its edges are ${actual.join(', ') || 'none'}, not the publish set's runtime edges ${expected.join(', ')}`);
  for (const edge of edges) {
    if (!recorded.has(edge?.from) || !recorded.has(edge?.to)) continue;
    if (edge.version !== recorded.get(edge.to)) problems.push(`the edge ${edge.from} to ${edge.to} records ${edge.version}, not ${recorded.get(edge.to)}`);
    else if (!caretAllows(edge.range, edge.version)) problems.push(`${edge.from} requires ${edge.to}@${edge.range}, which does not admit ${edge.version}`);
  }
  return problems;
}

/**
 * Problems (`{ code, detail }`) in the versions a release proposes against the prior release `priorManifest`, which must
 * inventory the whole publish set and its edges. `versions` maps every package to its version, and `reused` holds the
 * packages the release keeps at their prior version. Every published package moves ahead of its prior version, and a
 * reused package whose recorded range does not admit a sibling's new version must publish instead.
 */
export function findVersionProblems({ priorManifest, publishSet, versions, reused = new Map() }) {
  const inventory = findPriorManifestProblems(priorManifest, publishSet);
  if (inventory.length > 0) return inventory.map((detail) => ({ code: 'P2_1_PRIOR_RELEASE_INVALID', detail: `the prior release manifest is unusable: ${detail}` }));
  const missing = publishSet.packages.filter(({ name }) => !versions.has(name)).map(({ name }) => name);
  if (missing.length > 0) return [{ code: 'P2_1_RELEASE_VERSIONS_INVALID', detail: `no proposed version for ${missing.join(', ')}` }];
  const problems = [];
  const priorVersions = new Map(priorManifest.packages.map(({ name, version }) => [name, version]));
  for (const [name, after] of versions) {
    if (reused.has(name)) continue;
    const before = priorVersions.get(name);
    const order = compareVersions(after, before);
    if (order < 0) problems.push({ code: 'P2_1_VERSION_NOT_AHEAD', detail: `${name} goes back from ${before} to ${after}` });
    else if (order === 0) problems.push({ code: 'P2_1_VERSION_NOT_AHEAD', detail: `${name} repeats ${before}; reuse it with an empty version instead` });
  }
  for (const { from, to, range } of priorManifest.compatibility.edges) {
    if (reused.has(from) && !caretAllows(range, versions.get(to))) {
      problems.push({ code: 'P2_1_VERSION_RANGE_BROKEN', detail: `${from} requires ${to}@${range}, which does not admit ${versions.get(to)}; ${from} must publish` });
    }
  }
  return problems;
}

/** Release preparation's version check: `findVersionProblems`, failing on any. Returns the record the preparation data keeps. */
export function assertReleaseVersions({ priorManifest, publishSet, versions, reused }) {
  const problems = findVersionProblems({ priorManifest, publishSet, versions, reused });
  if (problems.length > 0) fail('P2_1_RELEASE_VERSIONS_REJECTED', problems.map(({ code, detail }) => `${detail} (${code})`).join('; '));
  return { status: 'checked', priorRelease: priorManifest.id, priorRevision: priorManifest.source.revision };
}

/**
 * Problems in an installed candidate set (`E-P2.1-04`): each new package is installed at its prerelease candidate
 * version, the catalog's package version is its `catalogVersion`, and tooling's own range on the catalog admits it.
 * `installed` maps a package to the manifest version the consumer holds.
 */
export function findCandidateSetProblems({ versions, installed, toolingCatalogRange, catalogVersion }) {
  const problems = [];
  for (const name of NEW_PACKAGES) {
    const version = installed.get(name);
    if (version !== versions.get(name)) problems.push(`${name} installs ${version}, not the candidate ${versions.get(name)}`);
    else if (!/^\d+\.\d+\.\d+-rc\.[1-9]\d*$/u.test(version)) problems.push(`${name}@${version} is not an rc prerelease`);
  }
  if (catalogVersion !== installed.get(CATALOG_PACKAGE)) problems.push(`the catalog installs ${installed.get(CATALOG_PACKAGE)} but declares catalogVersion ${catalogVersion}`);
  else if (!caretAllows(toolingCatalogRange, catalogVersion)) problems.push(`${TOOLING_PACKAGE} requires ${CATALOG_PACKAGE}@${toolingCatalogRange}, which does not admit ${catalogVersion}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Naming the prior release and planning reuse

/** The blobs of a tree as buffers, in one `git cat-file --batch`, keyed by object id. */
function readBlobs(ids, cwd) {
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd, input: `${ids.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const blobs = new Map();
  for (let offset = 0; offset < output.length;) {
    const end = output.indexOf(0x0a, offset);
    const [id, , size] = output.toString('utf8', offset, end).split(' ');
    blobs.set(id, output.subarray(end + 1, end + 1 + Number(size)));
    offset = end + 1 + Number(size) + 1;
  }
  return blobs;
}

/**
 * Every tracked file at `revision` that parses as a JSON object whose `schema` is a portfolio release schema, of any
 * version, wherever it lives and however it is spaced: the first release has none. Files are judged by content, so a
 * manifest does not escape by its name, its folder, or its formatting.
 */
function portfolioManifestsIn(revision, cwd) {
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', '-l', revision], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\0').filter(Boolean).map((line) => /^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.*)$/su.exec(line)).filter(Boolean)
    .map(([, id, , path]) => ({ id, path }));
  const blobs = readBlobs([...new Set(listing.map(({ id }) => id))], cwd);
  const found = [];
  for (const { id, path } of listing) {
    const text = blobs.get(id)?.toString('utf8').trimStart() ?? '';
    if (!text.startsWith('{')) continue;
    let schema;
    try {
      schema = JSON.parse(text)?.schema;
    } catch {
      continue;
    }
    if (typeof schema === 'string' && schema.startsWith(PORTFOLIO_SCHEMA_PREFIX)) found.push(`${path} (${schema})`);
  }
  return found;
}

/**
 * What a release compares with. It must say so: `MUXUI_PRIOR_RELEASE_MANIFEST` is the path of the prior portfolio
 * manifest, or `MUXUI_FIRST_PORTFOLIO_RELEASE=true` declares there is none, which holds only while no tracked file at
 * `revision` is a portfolio release manifest of any schema version. Neither, both, or a flag that contradicts the tree
 * is refused, so a later release cannot skip the check by leaving the variable unset. The prior manifest is the one
 * committed at `revision` in the release ledger (`readLedgerManifest`).
 */
export function resolvePriorRelease({ environment, revision, cwd }) {
  const path = environment[PRIOR_RELEASE_VARIABLE] ?? '';
  const first = environment[FIRST_RELEASE_VARIABLE] ?? '';
  if (path !== '' && first !== '') fail('P2_1_PRIOR_RELEASE_AMBIGUOUS', `set ${PRIOR_RELEASE_VARIABLE} or ${FIRST_RELEASE_VARIABLE}, not both`);
  if (path === '' && first === '') {
    fail('P2_1_PRIOR_RELEASE_REQUIRED', `set ${PRIOR_RELEASE_VARIABLE} to the prior portfolio release manifest, or ${FIRST_RELEASE_VARIABLE}=true for the first portfolio release`);
  }
  if (first !== '') {
    if (first !== 'true') fail('P2_1_PRIOR_RELEASE_REQUIRED', `${FIRST_RELEASE_VARIABLE} must be true, not ${JSON.stringify(first)}`);
    const retained = portfolioManifestsIn(revision, cwd);
    if (retained.length > 0) fail('P2_1_FIRST_RELEASE_CONTRADICTED', `${FIRST_RELEASE_VARIABLE}=true, but ${retained.join(', ')} is a portfolio release; give ${PRIOR_RELEASE_VARIABLE}`);
    return { first: true };
  }
  // The prior manifest is the one the ledger holds at the release commit, not whatever file the path names.
  const ledgerPath = relative(cwd, resolve(cwd, path)).split(sep).join(posix.sep);
  try {
    return { first: false, priorManifest: readLedgerManifest({ path: ledgerPath, revision, cwd }) };
  } catch (error) {
    return fail('P2_1_PRIOR_RELEASE_UNAVAILABLE', `${PRIOR_RELEASE_VARIABLE} ${path} cannot be read from the release ledger (${error.message.split('\n')[0]})`);
  }
}

/**
 * The records a release reuses: for each package whose version input is empty (`names`), its record in the prior
 * release's manifest, with the version, integrity, and provenance that release recorded. Reuse is only possible against
 * a prior release (never the first), whose manifest inventories the whole set. The records are what
 * `buildPortfolioManifest` keeps for a reused package. Nothing checks that a reused package is unchanged: the release
 * chooses what it publishes.
 */
export function reusedRecords({ names, priorRelease, publishSet }) {
  if (names.length === 0) return new Map();
  if (priorRelease.first) {
    fail('P2_1_REUSE_NEEDS_PRIOR_RELEASE', `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} reused, and the first portfolio release has no prior release to reuse from`);
  }
  const unusable = findPriorManifestProblems(priorRelease.priorManifest, publishSet);
  if (unusable.length > 0) fail('P2_1_PRIOR_RELEASE_INVALID', `the prior release manifest is unusable: ${unusable.join('; ')}`);
  return new Map(names.map((name) => [name, priorRelease.priorManifest.packages.find((record) => record.name === name)]));
}

/**
 * What a release that reuses packages is: the records it keeps (`reusedRecords`, for every member of the set the
 * published versions `published` leave out), the manifests that published them (the prior release's, and for a package
 * the prior release itself reused, the manifest of the release before, committed at `revision` in the release ledger;
 * a reuse whose origin is not in the ledger stops here), and the version of every member of the set. A release that
 * reuses nothing needs no prior release.
 */
export function planReuse({ publishSet, published, priorRelease, revision, cwd, readRetained = readRetainedManifests }) {
  const reused = reusedRecords({ names: reusedNames(publishSet, published), priorRelease, publishSet });
  const priorManifests = readRetained({ ids: [...reused.values()].map(({ provenance }) => provenance?.releaseId), revision, cwd });
  if (!priorRelease.first) priorManifests.set(priorRelease.priorManifest.id, priorRelease.priorManifest);
  for (const [name, { version, provenance }] of reused) {
    if (!priorManifests.has(provenance?.releaseId)) {
      fail('P2_1_REUSE_ORIGIN_UNAVAILABLE', `${name}@${version} was published by ${provenance?.releaseId}, whose manifest is not in ${RELEASE_LEDGER}/ at ${revision}`);
    }
  }
  return { reused, priorManifests, versions: releaseVersions(publishSet, published, reused) };
}
