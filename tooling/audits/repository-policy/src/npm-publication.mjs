// Registry checks and ordered publication for .github/workflows/npm-publish.yml, and the candidate version
// rule shared with release-prepare.mjs. The publish job checks out only this file, release-set.mjs, and
// publish-set.json, so nothing else is imported.
//
//   node npm-publication.mjs validate-version   VERSION                           @muxui/react's rule
//   node npm-publication.mjs check-npm
//   node npm-publication.mjs preflight-set      MUXUI_RELEASE_VERSIONS            every package the release publishes, read-only
//   node npm-publication.mjs verify-candidate   CANDIDATE_DIR MUXUI_RELEASE_VERSIONS EXPECTED_SHA512 GITHUB_SHA
//   node npm-publication.mjs publish-set        the same, plus RUNNER_TEMP, and NPM_TOKEN for a first publish
//   node npm-publication.mjs preflight|recheck|read-back   one package (PACKAGE, default @muxui/react)
//
// Inputs come from the environment. Only `publish-set` writes to the registry, through `npm publish`. A package that
// exists on npm publishes through trusted publishing: npm exchanges the job's OIDC identity for a short-lived token
// per package. A package that does not exist yet cannot (`npm trust` needs an existing package), so its first publish
// alone uses the temporary NPM_TOKEN secret of the npm-publish environment, passed to that one `npm publish`;
// provenance is signed with the job's OIDC identity either way. Everything else is a public registry read. No
// deprecate, unpublish, dist-tag, or owner command exists here: a failed publication prints its recovery plan and
// executes none of it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PORTFOLIO_MANIFEST_FILE, candidateFileNames, readPublishSet, tarballFileName } from './release-set.mjs';

export const PACKAGE_NAME = '@muxui/react';
export const REGISTRY = 'https://registry.npmjs.org';
// npm trusted publishing (OIDC) needs npm CLI 11.5.1 or later.
export const MINIMUM_NPM = '11.5.1';
// Every package publishes `<base>-rc.N`: rc.1 first, then each rc the next number after the rc `next` points at
// (Decision 0023 amendment 01, Decision 0032 item 6). Roadmap R1 exit pins @muxui/react's base to 0.1.0.
const candidatePattern = /^(?<base>\d+\.\d+\.\d+)-rc\.(?<rc>[1-9]\d*)$/u;
const pinnedBases = new Map([[PACKAGE_NAME, '0.1.0']]);

export class NpmPublicationError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

const stop = (title, message) => {
  throw new NpmPublicationError(title, message);
};

/** Returns { base, rc } of an admitted candidate version of `name`, or throws. */
export function parseCandidate(name, version) {
  const match = candidatePattern.exec(String(version ?? ''));
  const pinned = pinnedBases.get(name);
  if (!match || (pinned !== undefined && match.groups.base !== pinned)) {
    stop('Invalid version', `${JSON.stringify(version)} is not an admitted candidate version for ${name} (${pinned ?? '<version>'}-rc.N, N >= 1).`);
  }
  return { base: match.groups.base, rc: Number(match.groups.rc) };
}

/** Returns the rc number of an admitted @muxui/react candidate version, or throws. */
export const parseCandidateVersion = (version) => parseCandidate(PACKAGE_NAME, version).rc;

/** The rc a rollback of `version` fixes forward to (Decision 0023's rollback plan). */
export function fixForwardVersion(version, name = PACKAGE_NAME) {
  const { base, rc } = parseCandidate(name, version);
  return `${base}-rc.${rc + 1}`;
}

export function meetsMinimumNpm(version, minimum = MINIMUM_NPM) {
  const parse = (value) => /^(\d+)\.(\d+)\.(\d+)/u.exec(value)?.slice(1).map(Number);
  const actual = parse(String(version).trim());
  if (!actual) return false;
  const required = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

/**
 * Classifies the pre-publish registry state of `name`. `versionStatus` is the HTTP status
 * of the version document; `packument` is the parsed package document, or null
 * when the package is absent (404).
 *
 * - first: the package is absent, so this must be its rc.1 (the registry sets `latest`).
 * - later: `latest` is recorded as-is, `next` must be a published rc of the same base and
 *   this version the next number after it (rc.N+1, Decision 0023 amendment 01), and no
 *   other dist-tag may exist.
 */
export function classifyPreflight({ name = PACKAGE_NAME, version, versionStatus, packument }) {
  const { base, rc } = parseCandidate(name, version);
  if (versionStatus === 200) stop('Version exists', `${name}@${version} is already on the registry; never overwrite or republish.`);
  if (versionStatus !== 404) stop('Registry read failed', `Unexpected HTTP ${versionStatus} reading ${name}@${version}.`);

  if (packument === null) {
    if (rc !== 1) {
      stop('Package absent', `${name} is absent, so only ${base}-rc.1 can be a first publish; ${version} follows a published rc.`);
    }
    return { kind: 'first', latest: '', next: '' };
  }

  const tags = packument['dist-tags'] ?? {};
  const versions = Object.keys(packument.versions ?? {});
  if (versions.includes(version)) stop('Version exists', `${name}@${version} is listed in the packument; never overwrite or republish.`);
  const tagNames = Object.keys(tags).sort();
  if (tagNames.join(',') !== 'latest,next') {
    stop('Dist-tag drift', `Expected exactly latest and next; found ${JSON.stringify(tags)}. Any dist-tag drift stops for a decision.`);
  }
  const { latest, next } = tags;
  if (!versions.includes(latest)) stop('Dist-tag drift', `latest points at ${latest}, which is not a published version.`);
  if (!versions.includes(next)) stop('Dist-tag drift', `next points at ${next}, which is not a published version.`);
  const previous = candidatePattern.exec(next)?.groups;
  if (previous?.base !== base || Number(previous.rc) + 1 !== rc) {
    stop('Not the next candidate', `${version} must be the next release candidate after next (rc.N+1); next points at ${next}. Anything else stops for a decision.`);
  }
  return { kind: 'later', latest, next };
}

/** Fails unless the current state matches the one recorded by the preflight. */
export function assertNoDrift(recorded, current) {
  for (const key of ['kind', 'latest', 'next']) {
    if ((recorded[key] ?? '') !== (current[key] ?? '')) {
      stop('Registry drift', `${key} changed since the preflight: recorded ${JSON.stringify(recorded[key] ?? '')}, now ${JSON.stringify(current[key] ?? '')}.`);
    }
  }
}

/**
 * Judges one dist-tag observation after publishing. Returns 'done', or 'wait'
 * while the packument still shows the pre-publish state (or is absent on a first
 * publish); any other state throws. `latest` must be unchanged, or set by the
 * registry to the new version on a first publish.
 */
export function judgeDistTags({ name = PACKAGE_NAME, version, recorded, packument }) {
  const expectedLatest = recorded.kind === 'first' ? version : recorded.latest;
  if (packument === null) {
    if (recorded.kind === 'first') return 'wait';
    stop('Registry read failed', `${name} returned 404 after publishing over an existing package.`);
  }
  const tags = packument['dist-tags'] ?? {};
  const known = Object.keys(tags).sort().join(',');
  if (known === 'latest,next' && tags.next === version && tags.latest === expectedLatest) return 'done';
  if (recorded.kind === 'later' && known === 'latest,next' && tags.next === recorded.next && tags.latest === recorded.latest) return 'wait';
  stop('Dist-tag drift', `Expected next=${version} and latest=${expectedLatest}; found ${JSON.stringify(tags)}. Any dist-tag drift stops for a decision.`);
}

/** Judges the version document: integrity and SLSA provenance must match. */
export function judgeVersionDocument({ name = PACKAGE_NAME, version, expectedIntegrity, document }) {
  const integrity = document?.dist?.integrity;
  if (integrity !== expectedIntegrity) {
    stop('Registry integrity mismatch', `${name}@${version} has ${integrity ?? 'no integrity'}; expected ${expectedIntegrity}.`);
  }
  const predicateType = document?.dist?.attestations?.provenance?.predicateType;
  if (!/^https:\/\/slsa\.dev\/provenance\//u.test(predicateType ?? '')) {
    stop('Provenance missing', `${name}@${version} has no SLSA provenance attestation.`);
  }
  return { integrity, predicateType };
}

const packageUrl = (name, version) => `${REGISTRY}/${name}${version ? `/${version}` : ''}`;

const fetchTimeoutMs = 30_000;

/** GETs a registry document: { status, body } with body null unless 200. Each request times out. */
export async function readRegistry(url, { fetch = globalThis.fetch } = {}) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

// Rate limits, server errors, and failed or timed-out requests are transient.
const transient = (status) => status === 429 || status >= 500;

/** Like readRegistry, but a thrown request becomes { status: 0 } so polling retries it. */
async function readRegistryForPoll(url, io) {
  try {
    return await readRegistry(url, io);
  } catch (error) {
    (io.log ?? console.log)(`Request to ${url} failed: ${error.message}`);
    return { status: 0, body: null };
  }
}

async function readPackument(name, io) {
  const { status, body } = await readRegistry(packageUrl(name), io);
  if (status === 404) return null;
  if (status !== 200) stop('Registry read failed', `Unexpected HTTP ${status} reading ${name}.`);
  return body;
}

export async function preflight(version, io = {}, name = PACKAGE_NAME) {
  parseCandidate(name, version);
  const { status } = await readRegistry(packageUrl(name, version), io);
  return classifyPreflight({ name, version, versionStatus: status, packument: await readPackument(name, io) });
}

/**
 * Polls until `attempt` returns a value other than undefined, or throws after
 * `attempts` tries. Errors from `attempt` stop immediately.
 */
export async function poll(label, attempt, { attempts, intervalMs, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), log = console.log }) {
  for (let index = 1; index <= attempts; index += 1) {
    const result = await attempt();
    if (result !== undefined) return result;
    if (index < attempts) {
      log(`Waiting for ${label} (attempt ${index} of ${attempts})`);
      await sleep(intervalMs);
    }
  }
  stop('Registry propagation timeout', `${label} did not appear after ${attempts} attempts.`);
}

/**
 * Reads back a publish: the version document first (integrity and provenance),
 * then the packument's dist-tags, each with bounded retries for CDN propagation.
 * Defaults allow about 5 minutes for the version and 10 for the dist-tags.
 */
export async function readBack({ name = PACKAGE_NAME, version, expectedIntegrity, recorded }, {
  versionAttempts = 21,
  tagAttempts = 41,
  intervalMs = 15_000,
  ...io
} = {}) {
  const versionResult = await poll(`${name}@${version}`, async () => {
    const { status, body } = await readRegistryForPoll(packageUrl(name, version), io);
    if (status === 200) return judgeVersionDocument({ name, version, expectedIntegrity, document: body });
    if (status === 0 || status === 404 || transient(status)) return undefined;
    stop('Registry read failed', `Unexpected HTTP ${status} reading ${name}@${version}.`);
  }, { attempts: versionAttempts, intervalMs, ...io });

  const distTags = await poll(`${name} dist-tags next=${version}`, async () => {
    const { status, body } = await readRegistryForPoll(packageUrl(name), io);
    if (status === 0 || transient(status)) return undefined;
    if (status !== 200 && status !== 404) stop('Registry read failed', `Unexpected HTTP ${status} reading ${name}.`);
    const packument = status === 404 ? null : body;
    return judgeDistTags({ name, version, recorded, packument }) === 'done' ? packument['dist-tags'] : undefined;
  }, { attempts: tagAttempts, intervalMs, ...io });

  return { ...versionResult, distTags };
}

export function recordedFromEnvironment(environment) {
  const kind = environment.PRE_KIND;
  if (kind !== 'first' && kind !== 'later') stop('Preflight missing', `PRE_KIND must be first or later, not ${JSON.stringify(kind)}.`);
  return { kind, latest: environment.PRE_LATEST ?? '', next: environment.PRE_NEXT ?? '' };
}

export function writeOutputs(environment, values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, lines);
}

function writeSummary(environment, markdown) {
  if (environment.GITHUB_STEP_SUMMARY) appendFileSync(environment.GITHUB_STEP_SUMMARY, markdown);
}

const describe = (state) => (state.kind === 'first'
  ? 'absent (first publish; the registry will set latest)'
  : `dist-tags latest=${state.latest} next=${state.next}`);

// ---------------------------------------------------------------------------
// The release's package set and its candidate.

/**
 * The version of each package the release publishes, from `name=version` pairs (the workflow's MUXUI_RELEASE_VERSIONS):
 * exactly one pair per member of the publish set, each an admitted candidate version of its package. A pair with an
 * empty version (`name=`) reuses the package: the Map leaves it out, and the release manifest says what it reuses. That
 * each version is an rc of the package's source version is `release-set.mjs validate-versions` in the prepare job,
 * which has the sources.
 */
export function parseVersionPairs(text, publishSet) {
  const given = new Map();
  for (const pair of String(text ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const [name, version, ...extra] = pair.split('=');
    if (version === undefined || extra.length > 0) stop('Invalid versions', `${JSON.stringify(pair)} is not name=version.`);
    if (!publishSet.packages.some((entry) => entry.name === name)) stop('Invalid versions', `${name} is not in the publish set.`);
    if (given.has(name)) stop('Invalid versions', `${name} is listed twice.`);
    if (version !== '') parseCandidate(name, version);
    given.set(name, version);
  }
  const missing = publishSet.packages.filter(({ name }) => !given.has(name)).map(({ name }) => name);
  if (missing.length > 0) stop('Invalid versions', `A release names every member of the set, with an empty version to reuse one; missing ${missing.join(', ')}.`);
  const versions = new Map(publishSet.packages.filter(({ name }) => given.get(name) !== '').map(({ name }) => [name, given.get(name)]));
  if (versions.size === 0) stop('Invalid versions', 'A release publishes at least one package; every version is empty.');
  return versions;
}

const integrityOf = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const integrityPattern = /^sha512-[A-Za-z0-9+/]{86}==$/u;

/** The integrities the `tarball-sha512` input authorizes: one sha512 per tarball the release publishes, comma separated. */
function parseAuthorized(text) {
  const listed = String(text ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  const bad = listed.filter((integrity) => !integrityPattern.test(integrity));
  if (bad.length > 0) stop('Integrity mismatch', `The tarball-sha512 input lists ${JSON.stringify(bad)}, ${bad.length === 1 ? 'which is not a sha512 integrity' : 'which are not sha512 integrities'}.`);
  return new Set(listed);
}

/**
 * Stops unless the tarball-sha512 input (`text`) authorizes exactly the tarballs a release publishes: the sha512
 * integrities of `published` (their manifest records), no more and no fewer, comma separated.
 */
export function assertAuthorizedTarballs(published, text) {
  const authorized = parseAuthorized(text);
  const recorded = new Set(published.map((record) => record.integrity));
  if (authorized.size !== recorded.size || ![...recorded].every((integrity) => authorized.has(integrity))) {
    stop('Integrity mismatch', `This release publishes ${published.map((record) => `${record.name} ${record.integrity}`).join(', ')}; the tarball-sha512 input authorizes ${authorized.size === 0 ? 'nothing' : [...authorized].join(', ')}.`);
  }
}

/**
 * Reads the downloaded candidate the way the publish job must trust it: exactly the tarball of each published package
 * and the portfolio manifest; the manifest is for this commit (`revision`) and lists the set in publish order; a package
 * is published exactly when its version input is not empty, and reused exactly when it is; each published package is the
 * manifest's recorded bytes (sha512) built from this commit and this release; and the published tarballs are exactly the
 * ones the operator authorized (`expectedIntegrity`, the tarball-sha512 input: their sha512 integrities, comma
 * separated). `versions` maps the published packages only. The prepare job already verified the manifest against its
 * sources; this repeats only what the bytes and inputs can show. Returns the packages to publish, in publish order, as
 * { name, version, file, integrity }, and the packages the release reuses, as { name, version, integrity }.
 */
export function readCandidateSet({ directory, publishSet, versions, revision, expectedIntegrity }) {
  const expected = candidateFileNames(publishSet, versions);
  const found = readdirSync(directory).sort();
  if (found.join() !== [...expected].sort().join()) {
    stop('Candidate ambiguous', `Expected exactly the tarball of each published package and one release manifest, ${JSON.stringify(expected)}; found ${JSON.stringify(found)}.`);
  }
  const manifest = JSON.parse(readFileSync(join(directory, PORTFOLIO_MANIFEST_FILE), 'utf8'));
  if (manifest.source?.revision !== revision) {
    stop('Candidate lineage', `The release manifest is for ${manifest.source?.revision}; this run is at ${revision}.`);
  }
  const records = manifest.packages ?? [];
  if (records.map(({ name }) => name).join() !== publishSet.packages.map(({ name }) => name).join()) {
    stop('Candidate lineage', `The release manifest lists ${records.map(({ name }) => name).join(', ')}, not the publish set in order.`);
  }
  const packages = [];
  const reused = [];
  for (const record of records) {
    const { name } = record;
    const version = versions.get(name);
    if (version === undefined) {
      if (record.role !== 'reused') stop('Candidate lineage', `The version input for ${name} is empty, which reuses it, and the release manifest has it as ${JSON.stringify(record.role)}.`);
      reused.push({ name, version: record.version, integrity: record.integrity });
      continue;
    }
    if (record.role !== 'published') stop('Candidate lineage', `${name} has role ${JSON.stringify(record.role)} in the release manifest, and its version input publishes it.`);
    if (record.version !== version || record.file !== tarballFileName(name, version)) {
      stop('Version mismatch', `${name} is ${record.version} (${record.file}) in the release manifest; the version input is ${version}.`);
    }
    const file = join(directory, record.file);
    const integrity = integrityOf(readFileSync(file));
    if (!integrityPattern.test(record.integrity ?? '') || integrity !== record.integrity) {
      stop('Integrity mismatch', `${name}@${version} tarball is ${integrity}; the release manifest records ${record.integrity}.`);
    }
    if (record.provenance?.sourceCommit !== revision || record.provenance?.releaseId !== manifest.id) {
      stop('Candidate lineage', `${name}@${version} records ${record.provenance?.sourceCommit} in ${record.provenance?.releaseId}; this run publishes ${revision} in ${manifest.id}.`);
    }
    packages.push({ name, version, file, integrity });
  }
  assertAuthorizedTarballs(records.filter(({ name }) => versions.has(name)), expectedIntegrity);
  return { packages, reused };
}

const fetchBytes = async (url, { fetch = globalThis.fetch } = {}) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  return { status: response.status, bytes: response.status === 200 ? Buffer.from(await response.arrayBuffer()) : null };
};

/**
 * Whether `name@version` is on the registry exactly as its earlier release recorded it: the version document names the
 * recorded integrity and carries SLSA provenance, as the publish read-back requires. Returns the version document.
 */
export async function readReusedVersion({ name, version, integrity }, io = {}) {
  const { status, body } = await readRegistry(packageUrl(name, version), io);
  if (status === 404) stop('Reused package absent', `${name}@${version}, which this release reuses, is not on the registry.`);
  if (status !== 200) stop('Registry read failed', `Unexpected HTTP ${status} reading ${name}@${version}.`);
  judgeVersionDocument({ name, version, expectedIntegrity: integrity, document: body });
  return body;
}

/** The bytes of a reused package, taken from the public registry by exact version and held to the recorded integrity. */
export async function fetchReusedTarball(record, io = {}) {
  const { name, version, integrity } = record;
  const document = await readReusedVersion(record, io);
  const url = document.dist.tarball;
  if (typeof url !== 'string' || !url.startsWith(`${REGISTRY}/`)) stop('Registry tarball invalid', `${name}@${version} names its tarball at ${JSON.stringify(url)}, not on ${REGISTRY}.`);
  const { status, bytes } = await fetchBytes(url, io);
  if (status !== 200) stop('Registry read failed', `Unexpected HTTP ${status} reading the tarball of ${name}@${version}.`);
  if (integrityOf(bytes) !== integrity) stop('Registry integrity mismatch', `The tarball of ${name}@${version} is ${integrityOf(bytes)}; its earlier release recorded ${integrity}.`);
  return bytes;
}

// ---------------------------------------------------------------------------
// Ordered publication and its recovery plan.

/**
 * Publishes `packages` in order, one at a time, and stops at the first failure.
 *
 * First every package the release reuses is read from the registry at its recorded integrity, and every package it
 * publishes is preflighted (read-only), so a collision or a bad lineage anywhere in the set stops the release before
 * the first publish. So does a first publish (the package is absent) when there is no `token`: such a
 * package cannot publish through trusted publishing, and nothing falls back. Then for each package: the drift
 * recheck, `publish(package, { token })` (the injected `npm publish`; `token` is given to a first publish only, an
 * existing package publishes through OIDC), and the registry read-back of its integrity, provenance, and dist-tags. A failure rethrows with
 * `error.progress` = { attempted, verified, failed }: the packages whose publish was attempted, those whose
 * read-back passed, and the one that failed with the phase it failed in. Nothing later is attempted.
 */
export async function publishSet({ packages, reused = [], publish, token, ...io }) {
  const log = io.log ?? console.log;
  const progress = { attempted: [], verified: [], failed: null };
  const recorded = new Map();
  // A reused package is not published, but the release stands on it: it must be on the registry as recorded.
  for (const record of reused) {
    try {
      await readReusedVersion(record, io);
    } catch (error) {
      progress.failed = { name: record.name, version: record.version, phase: 'preflight' };
      error.progress = progress;
      throw error;
    }
    log(`${record.name}@${record.version}: reused, on the registry with ${record.integrity}`);
  }
  for (const { name, version } of packages) {
    let state;
    try {
      state = await preflight(version, io, name);
    } catch (error) {
      progress.failed = { name, version, phase: 'preflight' };
      error.progress = progress;
      throw error;
    }
    log(`${name}@${version}: 404 (no collision)`);
    log(`${name} ${describe(state)}`);
    recorded.set(name, state);
  }
  const firstPublishes = packages.filter(({ name }) => recorded.get(name).kind === 'first').map(({ name }) => name);
  if (firstPublishes.length > 0 && !token) {
    progress.failed = { name: firstPublishes[0], version: packages.find(({ name }) => name === firstPublishes[0]).version, phase: 'preflight' };
    const failure = new NpmPublicationError('First publish needs a token', `${firstPublishes.join(', ')} ${firstPublishes.length === 1 ? 'does' : 'do'} not exist on npm yet, and trusted publishing cannot create a package. Add the temporary NPM_TOKEN secret to the npm-publish environment and dispatch again; nothing falls back and nothing was published.`);
    failure.progress = progress;
    throw failure;
  }
  log(`Preflight passed for ${packages.length} packages; publishing in order.`);

  for (const [index, pkg] of packages.entries()) {
    const { name, version, integrity } = pkg;
    let phase = 'recheck';
    try {
      log(`Publishing ${name}@${version} (${index + 1} of ${packages.length})`);
      assertNoDrift(recorded.get(name), await preflight(version, io, name));
      log(`No drift since the preflight: ${name} ${describe(recorded.get(name))}`);
      phase = 'publish';
      progress.attempted.push({ name, version, integrity });
      // Only a package that does not exist yet gets the token; an existing one publishes through OIDC.
      const first = recorded.get(name).kind === 'first';
      log(`Authentication for ${name}: ${first ? 'temporary npm token (first publish)' : 'trusted publishing (OIDC)'}`);
      await publish(pkg, { token: first ? token : undefined });
      phase = 'read-back';
      log(`Read back ${name}@${version}`);
      const result = await readBack({ name, version, expectedIntegrity: integrity, recorded: recorded.get(name) }, io);
      log(`dist.integrity: ${result.integrity}`);
      log(`provenance: ${result.predicateType}`);
      log(`dist-tags: ${JSON.stringify(result.distTags)}`);
      progress.verified.push({ name, version, integrity, distTags: result.distTags });
      log(`Published ${name}@${version} (${index + 1} of ${packages.length})`);
    } catch (error) {
      progress.failed = { name, version, phase };
      const failure = error instanceof NpmPublicationError ? error : new NpmPublicationError(`${phase === 'publish' ? 'Publish' : 'Registry'} failed`, `${name}@${version}: ${error.message}`);
      failure.progress = progress;
      throw failure;
    }
  }
  return progress.verified;
}

/**
 * Reads, from the registry, what each attempted package actually is, because a failed publish command can still
 * have landed: 'healthy' (the candidate's bytes, with provenance), 'bad-bytes' (another integrity), 'unattested'
 * (the candidate's bytes without provenance), or 'unverified' (unreadable, or not visible). A 404 after an attempt is
 * never 'absent': npm may have accepted the PUT with the version visible only later, whether or not the command
 * reported an error, so it stays unverified until read again. Read-only.
 */
export async function assessAttempted(attempted, io = {}) {
  return Promise.all(attempted.map(async ({ name, version, integrity }) => {
    try {
      const { status, body } = await readRegistry(packageUrl(name, version), io);
      if (status !== 200) return { name, version, state: 'unverified' };
      try {
        judgeVersionDocument({ name, version, expectedIntegrity: integrity, document: body });
        return { name, version, state: 'healthy' };
      } catch (error) {
        return { name, version, state: body?.dist?.integrity === integrity ? 'unattested' : 'bad-bytes', reason: error.message };
      }
    } catch {
      return { name, version, state: 'unverified' };
    }
  }));
}

/**
 * The recovery plan after a failed publication, as Decision 0023 amendment 01 and Decision 0032 item 9 set it. It
 * is a plan and nothing here runs it. `set` is the publish set in order and `assessed` the result of
 * `assessAttempted`. Only a version that published bad bytes is deprecated, with Andrew's separate authorization, and
 * fixed forward; a package that was never attempted needs nothing; a healthy version stays published and is not
 * deprecated; an attempted package the registry does not show stops for a decision, never as "nothing to do" and never
 * as a republish of the same version; no record is rewritten.
 */
export function planRecovery({ set, assessed }) {
  const byName = new Map(assessed.map((entry) => [entry.name, entry]));
  const packages = set.map(({ name, version }) => {
    const found = byName.get(name);
    const state = found?.state ?? 'not-attempted';
    const next = fixForwardVersion(version, name);
    const action = {
      'not-attempted': { deprecate: false, text: 'never attempted; nothing to do' },
      healthy: { deprecate: false, text: 'published and verified; stays published and is not deprecated' },
      'bad-bytes': { deprecate: true, fixForward: next, text: `published bad bytes; deprecate ${version} (separate explicit authorization) and fix forward to ${next}` },
      unattested: { deprecate: false, text: 'published the candidate bytes without provenance; stop for a decision, and deprecate nothing automatically' },
      unverified: { deprecate: false, text: 'the publish may have landed and is not visible yet; stop for a decision, re-check the registry later, do not republish this version, and deprecate nothing until it is known' },
    }[state];
    return { name, version, state, ...action };
  });
  return {
    packages,
    steps: [
      'stop further publication; preserve every published version and the release manifest',
      ...packages.filter(({ deprecate }) => deprecate).map(({ name, text }) => `${name}: ${text}`),
      'fix forward with a new dispatch at versions the registry does not hold yet, through a separately authorized publication',
      'verify the tuple again against a new release manifest; no record is rewritten',
      'latest is not claimed or promoted',
    ],
  };
}

const planLines = (plan) => [
  'Recovery plan (a plan only; nothing was deprecated, unpublished, or re-tagged):',
  ...plan.packages.map(({ name, version, state, text }) => `- ${name}@${version}: ${state}; ${text}`),
  ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
];

/** Reads the registry for what the failed run attempted and prints the recovery plan; never executes it. */
async function reportRecovery({ packages, error, environment, io }) {
  const log = io.log ?? console.log;
  const assessed = await assessAttempted(error.progress?.attempted ?? [], io);
  const plan = planRecovery({ set: packages, assessed });
  const lines = planLines(plan);
  for (const line of lines) log(line);
  const { failed } = error.progress ?? {};
  writeSummary(environment, [
    '### Publication stopped',
    '',
    ...(failed ? [`Failed: ${failed.name}@${failed.version} (${failed.phase}): ${error.message}`, ''] : []),
    '```',
    ...lines,
    '```',
    '',
  ].join('\n'));
  return plan;
}

/**
 * The environment of one `npm publish`. No credential is inherited: the temporary token, NODE_AUTH_TOKEN, and any npm auth
 * setting are removed, so an existing package can only publish through OIDC. A first publish adds `token` as npm's
 * `//registry.npmjs.org/:_authToken` config for this child process alone, not a file. The job's OIDC request variables stay,
 * because provenance is signed with them in both cases.
 */
export function publishEnvironment(environment, token) {
  const env = { ...environment, npm_config_engine_strict: 'false' };
  for (const key of Object.keys(env)) {
    if (key === 'NODE_AUTH_TOKEN' || key === 'NPM_TOKEN' || /^npm_config_.*(?:_authToken|_auth|_password)$/iu.test(key)) delete env[key];
  }
  if (token) env['npm_config_//registry.npmjs.org/:_authToken'] = token;
  return env;
}

// `npm publish` of one candidate tarball. Run outside the checkout so npm reads no project config; the registry and
// the candidate's publishConfig pin the destination, and no registry-url is set, so no .npmrc is written.
function npmPublish({ file }, environment, { token }) {
  execFileSync('npm', ['publish', file, '--tag', 'next', '--provenance', '--access', 'public', `--registry=${REGISTRY}`], {
    cwd: environment.RUNNER_TEMP,
    stdio: 'inherit',
    env: publishEnvironment(environment, token),
  });
}

/** The temporary NPM_TOKEN of this run, or undefined (an unset secret is an empty string). Taken out of the environment. */
function takeToken(environment) {
  const token = environment.NPM_TOKEN || undefined;
  delete environment.NPM_TOKEN;
  if (token !== undefined && !/^\S+$/u.test(token)) stop('Environment invalid', 'NPM_TOKEN is not a single-line token.');
  return token;
}

function requireEnvironment(environment, checks) {
  for (const [name, pattern] of Object.entries(checks)) {
    if (!pattern.test(environment[name] ?? '')) stop('Environment invalid', `${name} is ${JSON.stringify(environment[name] ?? null)}.`);
  }
}

/** The versions and verified candidate of this run: the packages to publish, in publish order, and the ones it reuses. */
function candidateFromEnvironment(environment) {
  requireEnvironment(environment, { GITHUB_SHA: /^[0-9a-f]{40}$/u, CANDIDATE_DIR: /^\/\S+$/u });
  const publishSet = readPublishSet();
  const versions = parseVersionPairs(environment.MUXUI_RELEASE_VERSIONS, publishSet);
  return {
    versions,
    ...readCandidateSet({
      directory: environment.CANDIDATE_DIR, publishSet, versions, revision: environment.GITHUB_SHA, expectedIntegrity: environment.EXPECTED_SHA512,
    }),
  };
}

export async function main(command, environment = process.env, io = {}) {
  const version = environment.VERSION;
  const name = environment.PACKAGE ?? PACKAGE_NAME;
  const log = io.log ?? console.log;
  switch (command) {
    case 'validate-version':
      parseCandidateVersion(version);
      log(`${version} is an admitted candidate version; a rollback would fix forward to ${fixForwardVersion(version)}.`);
      return;
    case 'check-npm': {
      const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
      if (!meetsMinimumNpm(npmVersion)) stop('npm too old', `Trusted publishing needs npm ${MINIMUM_NPM} or later; found ${npmVersion}.`);
      log(`npm ${npmVersion} supports trusted publishing (>= ${MINIMUM_NPM}).`);
      return;
    }
    case 'preflight': {
      const state = await preflight(version, io, name);
      log(`${name}@${version}: 404 (no collision)`);
      log(`${name} ${describe(state)}`);
      writeOutputs(environment, { kind: state.kind, latest: state.latest, next: state.next });
      return;
    }
    case 'preflight-set': {
      const publishSet = readPublishSet();
      const versions = parseVersionPairs(environment.MUXUI_RELEASE_VERSIONS, publishSet);
      const lines = [];
      for (const name of publishSet.packages.map((entry) => entry.name).filter((entry) => !versions.has(entry))) {
        log(`${name}: reused (not preflighted; the prior release manifest names its version)`);
        lines.push(`- ${name}: reused, not preflighted`);
      }
      for (const [packageName, packageVersion] of versions) {
        const state = await preflight(packageVersion, io, packageName);
        log(`${packageName}@${packageVersion}: 404 (no collision)`);
        log(`${packageName} ${describe(state)}`);
        lines.push(`- ${packageName}@${packageVersion}: ${describe(state)}`);
      }
      writeSummary(environment, `### Registry preflight\n\n${lines.join('\n')}\n`);
      return;
    }
    case 'recheck': {
      const recorded = recordedFromEnvironment(environment);
      assertNoDrift(recorded, await preflight(version, io, name));
      log(`No drift since the preflight: ${name} ${describe(recorded)}`);
      return;
    }
    case 'read-back': {
      const recorded = recordedFromEnvironment(environment);
      const result = await readBack({ name, version, expectedIntegrity: environment.EXPECTED_SHA512, recorded }, io);
      log(`dist.integrity: ${result.integrity}`);
      log(`provenance: ${result.predicateType}`);
      log(`dist-tags: ${JSON.stringify(result.distTags)}`);
      writeSummary(environment, [
        `### Published ${name}@${version}`,
        '',
        `- dist.integrity: \`${result.integrity}\``,
        `- provenance: \`${result.predicateType}\``,
        `- dist-tags: \`${JSON.stringify(result.distTags)}\``,
        '',
      ].join('\n'));
      return;
    }
    case 'verify-candidate': {
      const { packages, reused } = candidateFromEnvironment(environment);
      log(`Candidate verified: ${packages.map((entry) => `${entry.name}@${entry.version} ${entry.integrity}`).join(', ')}`);
      if (reused.length > 0) log(`Reused, not published: ${reused.map((entry) => `${entry.name}@${entry.version} ${entry.integrity}`).join(', ')}`);
      return;
    }
    case 'publish-set': {
      requireEnvironment(environment, { RUNNER_TEMP: /^\/\S+$/u });
      const { packages, reused } = candidateFromEnvironment(environment);
      const token = takeToken(environment);
      log(`Publish set: ${packages.map((entry) => `${entry.name}@${entry.version}`).join(', ')}`);
      try {
        const verified = await publishSet({ ...io, packages, reused, token, publish: io.publish ?? ((pkg, auth) => npmPublish(pkg, environment, auth)) });
        writeSummary(environment, [
          '### Published to next',
          '',
          ...verified.map(({ name: packageName, version: packageVersion, integrity, distTags }) => `- ${packageName}@${packageVersion}: \`${integrity}\`, dist-tags \`${JSON.stringify(distTags)}\``),
          '',
        ].join('\n'));
      } catch (error) {
        await reportRecovery({ packages, error, environment, io });
        throw error;
      }
      return;
    }
    default:
      stop('Unknown command', `Expected validate-version, check-npm, preflight, preflight-set, recheck, read-back, verify-candidate, or publish-set; got ${JSON.stringify(command)}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    const title = error instanceof NpmPublicationError ? error.title : 'npm publication check failed';
    console.log(`::error title=${title}::${error.message}`);
    process.exitCode = 1;
  }
}
