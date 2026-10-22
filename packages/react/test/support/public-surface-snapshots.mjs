// The two packages the public-surface check compares, laid out in one scratch directory so that a
// single compile reads both: the declarations before the TypeScript moves (the frozen fixture) and the
// current build. Each is a real package named `@muxui/react` with its own export map, because the
// declarations import their own package by that name; the baseline keeps the name and takes a distinct
// version. TypeScript merges two packages with the same name and version into one file set, and a
// renamed baseline would resolve its self-imports to the current package. `assertResolution` proves
// neither happened, from the compiler's own resolution trace.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { runTsc } from './declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const BASELINE_DIRECTORY = resolve(packageRoot, 'test/fixtures/public-surface-baseline');
export const BASELINE_VERSION = '0.0.0-public-surface-baseline';
const PACKAGE_NAME = '@muxui/react';

const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const declarationFiles = (directory) => readdirSync(directory).filter((name) => name.endsWith('.d.ts')).sort();

/**
 * The frozen baseline: its declaration files and the package manifest the historical build shipped,
 * under the baseline version. Each file must still match the digest the generator recorded.
 */
export function loadBaseline() {
  const provenance = JSON.parse(readFileSync(join(BASELINE_DIRECTORY, 'provenance.json'), 'utf8'));
  const names = declarationFiles(BASELINE_DIRECTORY);
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(provenance.files).sort())) {
    throw new Error(`the baseline fixture holds ${names.join(', ')}, and its provenance lists ${Object.keys(provenance.files).join(', ')}`);
  }
  const files = {};
  for (const name of names) {
    files[name] = readFileSync(join(BASELINE_DIRECTORY, name), 'utf8');
    if (sha256(files[name]) !== provenance.files[name]) throw new Error(`${name} no longer matches the digest recorded for commit ${provenance.commit}`);
    if (files[name].includes('@generated-')) throw new Error(`${name} carries a generated marker, which repository policy reads as a projection`);
  }
  return { files, manifest: { name: PACKAGE_NAME, version: BASELINE_VERSION, type: 'module', exports: provenance.exports } };
}

/** The current build: the declaration files `pnpm generate` wrote, and the package's own export map. */
export function loadCurrent() {
  const directory = resolve(packageRoot, 'generated');
  const { name, version, exports } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  const files = Object.fromEntries(declarationFiles(directory).map((file) => [file, readFileSync(join(directory, file), 'utf8')]));
  return { files, manifest: { name, version, type: 'module', exports } };
}

/** The entry points of an export map that carry types, as `{ key, file }` with the file relative to the package. */
function typedEntries(manifest) {
  return Object.entries(manifest.exports)
    .filter(([, target]) => typeof target?.types === 'string')
    .map(([key, target]) => ({ key, file: target.types.replace(/^\.\//u, '') }));
}

/** The shared React types every snapshot resolves against: this package's own installed copies. */
function installedReactTypes() {
  return Object.fromEntries(['react', 'react-dom'].map((name) => [`@types/${name}`, resolve(packageRoot, 'node_modules/@types', name)]));
}

/**
 * Writes `baseline` and `current` (each `{ files, manifest }`) as sibling packages of a fresh scratch
 * directory, and links one physical copy of the React types for both. `linkCurrent` also installs the
 * current package under `node_modules`, as a consumer would; only the renamed-baseline control needs it.
 * `dispose()` removes the directory.
 */
export function createSnapshots({ baseline, current, reactTypes = installedReactTypes(), linkCurrent = false }) {
  // The compilers print real paths, so the directory is one, and the resolution trace can be compared with it.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'muxui-public-surface-')));
  const write = (name, { files, manifest }) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'generated'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, 'generated', file), text);
    const entries = typedEntries(manifest).map(({ key, file }) => ({ key, path: join(dir, file) }));
    const selfImporters = Object.entries(files)
      .filter(([, text]) => /['"]@muxui\/react(?:\/[^'"]*)?['"]/u.test(text))
      .map(([file]) => join(dir, 'generated', file));
    return { dir, manifest, entries, selfImporters };
  };
  const snapshots = { root, baseline: write('baseline', baseline), current: write('current', current) };
  for (const [name, source] of Object.entries(reactTypes)) {
    mkdirSync(dirname(join(root, 'node_modules', name)), { recursive: true });
    symlinkSync(source, join(root, 'node_modules', name), 'junction');
  }
  if (linkCurrent) {
    mkdirSync(join(root, 'node_modules/@muxui'), { recursive: true });
    symlinkSync(snapshots.current.dir, join(root, 'node_modules/@muxui/react'), 'junction');
  }
  snapshots.reactTypes = Object.fromEntries(Object.entries(reactTypes).map(([name, source]) => [name, realpathSync(source)]));
  snapshots.dispose = () => rmSync(root, { recursive: true, force: true });
  return snapshots;
}

/** The specifier a file at the scratch root imports `entry` of `snapshot` by. */
export function entrySpecifier(snapshots, snapshot, entry) {
  return `./${relative(snapshots.root, entry.path).split(sep).join('/').replace(/\.d\.ts$/u, '.js')}`;
}

const RESOLUTION = /======== Resolving module '([^']+)' from '([^']+)'\. ========\n[\s\S]*?======== Module name '\1' was (?:successfully resolved to '([^']+)'(?: with Package ID '([^']+)')?|(not resolved))\. ========/gu;

/**
 * Compiles `config` (a project of the scratch directory importing both snapshots) with `--traceResolution
 * --listFilesOnly` and throws unless, under that compiler:
 * - every snapshot file that imports `@muxui/react` resolves it into its own snapshot, under that
 *   snapshot's own package version, and the two versions differ;
 * - every `react` or `react-dom` import of either snapshot resolves into the one shared copy;
 * - no import of either snapshot is unresolved, and both packages' entry files are in the program.
 * An unresolved import would otherwise read as an `any` that every pair passes.
 */
export function assertResolution({ tsc, config, snapshots }) {
  const { stdout, label } = runTsc({ tsc, config, directory: snapshots.root, args: ['--traceResolution', '--listFilesOnly'] });
  const sides = [['baseline', snapshots.baseline], ['current', snapshots.current]];
  if (snapshots.baseline.manifest.version === snapshots.current.manifest.version) {
    throw new Error(`${label}: both packages are version ${snapshots.current.manifest.version}, so TypeScript merges them into one`);
  }
  const owner = (file) => sides.find(([, { dir }]) => file.startsWith(`${dir}${sep}`));
  const seen = new Map(sides.map(([name]) => [name, new Set()]));
  const packageIds = new Map(sides.map(([name]) => [name, new Set()]));
  for (const [, specifier, from, resolved, packageId, unresolved] of stdout.matchAll(RESOLUTION)) {
    const side = owner(from);
    if (side === undefined) continue;
    const [name, snapshot] = side;
    if (unresolved) throw new Error(`${label}: ${specifier} is unresolved from ${from}`);
    if (/^@muxui\/react(?:\/|$)/u.test(specifier)) {
      if (!resolved.startsWith(`${snapshot.dir}${sep}`) || !packageId?.endsWith(`@${snapshot.manifest.version}`)) {
        throw new Error(`${label}: ${specifier} from the ${name} package resolves to ${resolved} (${packageId}), not into ${snapshot.dir}`);
      }
      seen.get(name).add(from);
      packageIds.get(name).add(packageId);
    } else if (/^react(?:-dom)?(?:\/|$)/u.test(specifier)) {
      const types = snapshots.reactTypes[`@types/${specifier.split('/')[0]}`];
      if (!resolved.startsWith(`${types}${sep}`)) throw new Error(`${label}: ${specifier} from the ${name} package resolves to ${resolved}, not the shared ${types}`);
    }
  }
  if ([...packageIds.get('baseline')].some((id) => packageIds.get('current').has(id))) {
    throw new Error(`${label}: the two packages' self-imports share a package ID, so TypeScript treats them as one package`);
  }
  for (const [name, snapshot] of sides) {
    const missing = snapshot.selfImporters.filter((file) => !seen.get(name).has(file));
    if (missing.length > 0) throw new Error(`${label}: no resolution of @muxui/react was traced from ${missing.join(', ')}`);
    const listed = new Set(stdout.split('\n'));
    const absent = snapshot.entries.filter(({ path }) => !listed.has(path));
    if (absent.length > 0) throw new Error(`${label}: ${absent.map(({ path }) => path).join(', ')} is not part of the program (merged into the other package)`);
  }
}
