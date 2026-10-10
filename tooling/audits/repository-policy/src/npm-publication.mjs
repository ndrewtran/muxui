// Read-only npm registry checks for .github/workflows/npm-publish.yml, and the
// candidate version rule shared with release-prepare.mjs. Self-contained: the
// publish job checks out only this file.
//
//   node npm-publication.mjs validate-version     VERSION
//   node npm-publication.mjs check-npm
//   node npm-publication.mjs preflight            VERSION
//   node npm-publication.mjs recheck              VERSION PRE_KIND PRE_LATEST PRE_NEXT
//   node npm-publication.mjs read-back            VERSION EXPECTED_SHA512 PRE_KIND PRE_LATEST PRE_NEXT
//
// Inputs come from the environment. Nothing here authenticates or writes to the
// registry; every result is a public registry read.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PACKAGE_NAME = '@muxui/react';
export const REGISTRY = 'https://registry.npmjs.org';
// npm trusted publishing (OIDC) needs npm CLI 11.5.1 or later.
export const MINIMUM_NPM = '11.5.1';
// Roadmap R1 exit admits rc.1, then any number of later rcs in sequence, each
// the next number after the rc `next` points at (Decision 0023 amendment 01).
const candidatePattern = /^0\.1\.0-rc\.(?<rc>[1-9]\d*)$/u;
const firstCandidate = '0.1.0-rc.1';

export class NpmPublicationError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

const stop = (title, message) => {
  throw new NpmPublicationError(title, message);
};

/** Returns the rc number of an admitted candidate version, or throws. */
export function parseCandidateVersion(version) {
  const match = candidatePattern.exec(String(version ?? ''));
  if (!match) stop('Invalid version', `${JSON.stringify(version)} is not an admitted candidate version (0.1.0-rc.N, N >= 1).`);
  return Number(match.groups.rc);
}

/** The rc a rollback of `version` fixes forward to (Decision 0023's rollback plan). */
export function fixForwardVersion(version) {
  return `0.1.0-rc.${parseCandidateVersion(version) + 1}`;
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
 * Classifies the pre-publish registry state. `versionStatus` is the HTTP status
 * of the version document; `packument` is the parsed package document, or null
 * when the package is absent (404).
 *
 * - first: the package is absent, so this must be rc.1 (today's first publish).
 * - later: `latest` is recorded as-is, `next` must be a published rc and this
 *   version the next number after it (rc.N+1, Decision 0023 amendment 01), and
 *   no other dist-tag may exist.
 */
export function classifyPreflight({ version, versionStatus, packument }) {
  const rc = parseCandidateVersion(version);
  if (versionStatus === 200) stop('Version exists', `${PACKAGE_NAME}@${version} is already on the registry; never overwrite or republish.`);
  if (versionStatus !== 404) stop('Registry read failed', `Unexpected HTTP ${versionStatus} reading ${PACKAGE_NAME}@${version}.`);

  if (packument === null) {
    if (version !== firstCandidate) {
      stop('Package absent', `${PACKAGE_NAME} is absent, so only ${firstCandidate} can be a first publish; ${version} follows a published rc.`);
    }
    return { kind: 'first', latest: '', next: '' };
  }

  const tags = packument['dist-tags'] ?? {};
  const versions = Object.keys(packument.versions ?? {});
  if (versions.includes(version)) stop('Version exists', `${PACKAGE_NAME}@${version} is listed in the packument; never overwrite or republish.`);
  const tagNames = Object.keys(tags).sort();
  if (tagNames.join(',') !== 'latest,next') {
    stop('Dist-tag drift', `Expected exactly latest and next; found ${JSON.stringify(tags)}. Any dist-tag drift stops for a decision.`);
  }
  const { latest, next } = tags;
  if (!versions.includes(latest)) stop('Dist-tag drift', `latest points at ${latest}, which is not a published version.`);
  if (!versions.includes(next)) stop('Dist-tag drift', `next points at ${next}, which is not a published version.`);
  if (!candidatePattern.test(next) || parseCandidateVersion(next) + 1 !== rc) {
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
export function judgeDistTags({ version, recorded, packument }) {
  const expectedLatest = recorded.kind === 'first' ? version : recorded.latest;
  if (packument === null) {
    if (recorded.kind === 'first') return 'wait';
    stop('Registry read failed', `${PACKAGE_NAME} returned 404 after publishing over an existing package.`);
  }
  const tags = packument['dist-tags'] ?? {};
  const known = Object.keys(tags).sort().join(',');
  if (known === 'latest,next' && tags.next === version && tags.latest === expectedLatest) return 'done';
  if (recorded.kind === 'later' && known === 'latest,next' && tags.next === recorded.next && tags.latest === recorded.latest) return 'wait';
  stop('Dist-tag drift', `Expected next=${version} and latest=${expectedLatest}; found ${JSON.stringify(tags)}. Any dist-tag drift stops for a decision.`);
}

/** Judges the version document: integrity and SLSA provenance must match. */
export function judgeVersionDocument({ version, expectedIntegrity, document }) {
  const integrity = document?.dist?.integrity;
  if (integrity !== expectedIntegrity) {
    stop('Registry integrity mismatch', `${PACKAGE_NAME}@${version} has ${integrity ?? 'no integrity'}; expected ${expectedIntegrity}.`);
  }
  const predicateType = document?.dist?.attestations?.provenance?.predicateType;
  if (!/^https:\/\/slsa\.dev\/provenance\//u.test(predicateType ?? '')) {
    stop('Provenance missing', `${PACKAGE_NAME}@${version} has no SLSA provenance attestation.`);
  }
  return { integrity, predicateType };
}

const packageUrl = (version) => `${REGISTRY}/${PACKAGE_NAME}${version ? `/${version}` : ''}`;

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

async function readPackument(io) {
  const { status, body } = await readRegistry(packageUrl(), io);
  if (status === 404) return null;
  if (status !== 200) stop('Registry read failed', `Unexpected HTTP ${status} reading ${PACKAGE_NAME}.`);
  return body;
}

export async function preflight(version, io = {}) {
  parseCandidateVersion(version);
  const { status } = await readRegistry(packageUrl(version), io);
  return classifyPreflight({ version, versionStatus: status, packument: await readPackument(io) });
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
export async function readBack({ version, expectedIntegrity, recorded }, {
  versionAttempts = 21,
  tagAttempts = 41,
  intervalMs = 15_000,
  ...io
} = {}) {
  const versionResult = await poll(`${PACKAGE_NAME}@${version}`, async () => {
    const { status, body } = await readRegistryForPoll(packageUrl(version), io);
    if (status === 200) return judgeVersionDocument({ version, expectedIntegrity, document: body });
    if (status === 0 || status === 404 || transient(status)) return undefined;
    stop('Registry read failed', `Unexpected HTTP ${status} reading ${PACKAGE_NAME}@${version}.`);
  }, { attempts: versionAttempts, intervalMs, ...io });

  const distTags = await poll(`${PACKAGE_NAME} dist-tags next=${version}`, async () => {
    const { status, body } = await readRegistryForPoll(packageUrl(), io);
    if (status === 0 || transient(status)) return undefined;
    if (status !== 200 && status !== 404) stop('Registry read failed', `Unexpected HTTP ${status} reading ${PACKAGE_NAME}.`);
    const packument = status === 404 ? null : body;
    return judgeDistTags({ version, recorded, packument }) === 'done' ? packument['dist-tags'] : undefined;
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

const describe = (state) => state.kind === 'first'
  ? `${PACKAGE_NAME} absent (first publish; the registry will set latest)`
  : `${PACKAGE_NAME} dist-tags latest=${state.latest} next=${state.next}`;

export async function main(command, environment = process.env, io = {}) {
  const version = environment.VERSION;
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
      const state = await preflight(version, io);
      log(`${PACKAGE_NAME}@${version}: 404 (no collision)`);
      log(describe(state));
      writeOutputs(environment, { kind: state.kind, latest: state.latest, next: state.next });
      return;
    }
    case 'recheck': {
      const recorded = recordedFromEnvironment(environment);
      assertNoDrift(recorded, await preflight(version, io));
      log(`No drift since the preflight: ${describe(recorded)}`);
      return;
    }
    case 'read-back': {
      const recorded = recordedFromEnvironment(environment);
      const result = await readBack({ version, expectedIntegrity: environment.EXPECTED_SHA512, recorded }, io);
      log(`dist.integrity: ${result.integrity}`);
      log(`provenance: ${result.predicateType}`);
      log(`dist-tags: ${JSON.stringify(result.distTags)}`);
      writeSummary(environment, [
        `### Published ${PACKAGE_NAME}@${version}`,
        '',
        `- dist.integrity: \`${result.integrity}\``,
        `- provenance: \`${result.predicateType}\``,
        `- dist-tags: \`${JSON.stringify(result.distTags)}\``,
        '',
      ].join('\n'));
      return;
    }
    default:
      stop('Unknown command', `Expected validate-version, check-npm, preflight, recheck, or read-back; got ${JSON.stringify(command)}.`);
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
