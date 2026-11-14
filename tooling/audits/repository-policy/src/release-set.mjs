// The declared publish set and the versions one release gives it. Every release publishes every member at its next rc.
// Release preparation, the pack checks, the release lineage, and the publish workflow all read `publish-set.json`
// through this module. Builtins only, so the workflow can validate its version inputs before it installs the workspace.
//
//   node release-set.mjs validate-versions   MUXUI_RELEASE_VERSIONS (`name=version` for every member of the set)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLISH_SET_FILE = 'tooling/audits/repository-policy/publish-set.json';
export const PUBLISH_SET_SCHEMA = 'muxui-publish-set-v1';
/** The one manifest a release writes beside its tarballs. */
export const PORTFOLIO_MANIFEST_FILE = 'muxui-portfolio.release-manifest.json';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packageName = /^@muxui\/[a-z0-9-]+$/u;
const rcVersion = /^(?<base>\d+\.\d+\.\d+)-rc\.(?<rc>[1-9]\d*)$/u;

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

/**
 * Validates a parsed publish set: packages in publish order, each with its directory and the Mux UI packages it may
 * depend on at runtime. An edge must point at an earlier package, so the order publishes dependencies first.
 */
export function validatePublishSet(value) {
  const code = 'P2_1_PUBLISH_SET_INVALID';
  if (value?.schema !== PUBLISH_SET_SCHEMA || !Array.isArray(value.packages) || value.packages.length === 0) {
    fail(code, `expected ${PUBLISH_SET_SCHEMA} with a non-empty packages list`);
  }
  const earlier = new Set();
  for (const entry of value.packages) {
    if (!packageName.test(entry?.name ?? '') || earlier.has(entry.name)) fail(code, `package ${JSON.stringify(entry?.name)} is not a unique @muxui name`);
    if (entry.path !== `packages/${entry.name.slice('@muxui/'.length)}`) fail(code, `${entry.name} must live at packages/<slug>`);
    if (!Array.isArray(entry.runtimeEdges) || entry.runtimeEdges.some((edge) => !earlier.has(edge))) {
      fail(code, `${entry.name} runtimeEdges must name packages that publish before it`);
    }
    earlier.add(entry.name);
  }
  return value;
}

export function readPublishSet(root = repositoryRoot) {
  return validatePublishSet(JSON.parse(readFileSync(resolve(root, PUBLISH_SET_FILE), 'utf8')));
}

/** The package's tarball name, as `pnpm pack` and `npm pack` name it. */
export const tarballFileName = (name, version) => `${name.replace(/^@/u, '').replace('/', '-')}-${version}.tgz`;

/** The files a release candidate holds: one tarball per package in publish order, then the portfolio manifest. */
export function candidateFileNames(publishSet, versions) {
  return [...publishSet.packages.map(({ name }) => tarballFileName(name, versions.get(name))), PORTFOLIO_MANIFEST_FILE];
}

/** Why `version` is not an rc of the source version (`<source base>-rc.N`, N >= 1), or null. */
export function candidateVersionProblem(version, sourceVersion) {
  const base = /^(\d+\.\d+\.\d+)/u.exec(sourceVersion ?? '')?.[1];
  const match = rcVersion.exec(version ?? '');
  if (!base) return `source version ${JSON.stringify(sourceVersion)} is not a semantic version`;
  if (!match) return `${JSON.stringify(version)} is not an rc version (${base}-rc.N, N >= 1)`;
  return match.groups.base === base ? null : `${version} is not a prerelease of the source version ${sourceVersion} (${base}-rc.N)`;
}

/**
 * The version of each package the release publishes, as a Map in publish order. `text` is `name=version` pairs separated
 * by commas, one for every member of the set. Without `text` (a local preparation) each package takes the first rc of
 * its source version. `sourceVersions` is a Map of the version each member's source manifest carries.
 */
export function parseReleaseVersions(text, publishSet, sourceVersions) {
  const code = 'P2_1_RELEASE_VERSIONS_INVALID';
  const given = new Map();
  for (const pair of (text ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const [name, version, ...extra] = pair.split('=');
    if (version === undefined || extra.length > 0) fail(code, `${JSON.stringify(pair)} is not name=version`);
    if (!publishSet.packages.some((entry) => entry.name === name)) fail(code, `${name} is not in the publish set`);
    if (given.has(name)) fail(code, `${name} is listed twice`);
    given.set(name, version);
  }
  const versions = new Map();
  for (const { name } of publishSet.packages) {
    const source = sourceVersions.get(name);
    if (text === undefined || text === '') {
      versions.set(name, `${/^(\d+\.\d+\.\d+)/u.exec(source)?.[1]}-rc.1`);
    } else if (!given.get(name)) {
      fail(code, `${name} needs a version: every release publishes every member of the set (${publishSet.packages.map((entry) => entry.name).join(', ')})`);
    } else {
      versions.set(name, given.get(name));
    }
    const problem = candidateVersionProblem(versions.get(name), source);
    if (problem) fail(code, `${name}: ${problem}`);
  }
  return versions;
}

export function readSourceVersions(publishSet, root = repositoryRoot) {
  return new Map(publishSet.packages.map(({ name, path }) => [name, JSON.parse(readFileSync(resolve(root, path, 'package.json'), 'utf8')).version]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (process.argv[2] !== 'validate-versions') fail('P2_1_RELEASE_SET_COMMAND_UNKNOWN', `expected validate-versions, got ${JSON.stringify(process.argv[2])}`);
    // Unset would default every package to rc.1 in a local preparation, which a workflow release never wants.
    if (!process.env.MUXUI_RELEASE_VERSIONS) fail('P2_1_RELEASE_VERSIONS_INVALID', 'MUXUI_RELEASE_VERSIONS is not set');
    const publishSet = readPublishSet();
    const versions = parseReleaseVersions(process.env.MUXUI_RELEASE_VERSIONS, publishSet, readSourceVersions(publishSet));
    for (const [name, version] of versions) console.log(`${name} ${version}`);
  } catch (error) {
    console.log(`::error title=Invalid release versions::${error.message}`);
    process.exitCode = 1;
  }
}
