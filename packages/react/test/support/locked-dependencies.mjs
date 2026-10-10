import { readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const unquote = (value) => value.replace(/^'(.*)'$/u, '$1');
// `name@version(peer suffix)` splits at the first `@` after a scope's own.
const splitKey = (key) => [key.slice(0, key.indexOf('@', 1)), key.slice(key.indexOf('@', 1) + 1)];
const baseVersion = (version) => version.split('(', 1)[0];

/** Reads the pnpm v9 lockfile into its importer edges, package integrities, and snapshot dependency edges. */
export async function readLockfile() {
  const importers = new Map();
  const integrities = new Map();
  const snapshots = new Map();
  let section = '';
  let key = '';
  let edge = '';
  let name = '';
  for (const line of (await readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')).split('\n')) {
    const top = line.match(/^(\w+):/u);
    if (top) { section = top[1]; continue; }
    const indent = line.length - line.trimStart().length;
    const text = unquote(line.trim().replace(/:$/u, ''));
    if (indent === 2 && line.trim()) {
      key = unquote(line.trim().replace(/:(?: \{\})?$/u, ''));
      if (section === 'importers') importers.set(key, new Map());
      if (section === 'snapshots') snapshots.set(key, { dependencies: new Map(), optionalDependencies: new Map() });
      continue;
    }
    if (section === 'importers') {
      if (indent === 4) edge = text;
      else if (indent === 6) { name = text; importers.get(key).set(`${edge}:${name}`, {}); }
      else if (indent === 8) {
        const [field, value] = line.trim().split(': ');
        importers.get(key).get(`${edge}:${name}`)[field] = value;
      }
    } else if (section === 'packages' && indent === 4) {
      const integrity = line.match(/resolution: \{integrity: (sha512-[^,}]+)/u)?.[1];
      if (integrity) integrities.set(key, integrity);
    } else if (section === 'snapshots') {
      if (indent === 4) edge = text;
      else if (indent === 6 && (edge === 'dependencies' || edge === 'optionalDependencies')) {
        const [dependency, reference] = line.trim().split(': ');
        snapshots.get(key)[edge].set(unquote(dependency), reference);
      }
    }
  }
  return { importers, integrities, snapshots };
}

/**
 * Problems with the exact, locked runtime dependencies one importer declares:
 * each npm edge must be an exact version (no range operator), the lockfile
 * importer must resolve that same version, and the package record must keep an
 * integrity. Workspace edges are skipped.
 */
export function exactLockedProblems(lockfile, importer, manifest, edges = ['dependencies']) {
  const problems = [];
  for (const edge of edges) {
    for (const [name, specifier] of Object.entries(manifest[edge] ?? {})) {
      if (specifier.startsWith('workspace:')) continue;
      const label = `${importer} ${edge} ${name}@${specifier}`;
      const locked = lockfile.importers.get(importer)?.get(`${edge}:${name}`);
      if (!exactVersion.test(specifier)) problems.push(`${label} is not an exact version`);
      else if (locked?.specifier !== specifier || baseVersion(locked.version ?? '') !== specifier) problems.push(`${label} is not resolved to that version by the lockfile`);
      else if (!lockfile.integrities.has(`${name}@${specifier}`)) problems.push(`${label} has no lockfile integrity`);
    }
  }
  return problems;
}

/**
 * Walks everything one locked importer dependency reaches over `edges`. Every
 * package reached needs a snapshot and a sha512 integrity, so a deleted record
 * is reported instead of read as a dependency-free leaf. A `link:` is followed
 * only to a workspace importer in the lockfile (resolved from the importer it
 * appears under); any other link is a problem. Returns the sorted `name@version`
 * strings (optionally narrowed to names the caller owns) and the problems found.
 */
export function lockedClosure(lockfile, importer, root, { edges = ['dependencies'], include = () => true } = {}) {
  const start = lockfile.importers.get(importer)?.get(`dependencies:${root}`)?.version;
  if (!start) return { packages: [], problems: [`${importer} does not lock ${root}`] };
  const problems = [];
  const seen = new Set();
  const linked = new Set();
  const pending = [[root, start, importer]];
  while (pending.length > 0) {
    const [name, reference, context] = pending.pop();
    if (reference.startsWith('link:')) {
      const target = posix.normalize(posix.join(context, reference.slice('link:'.length)));
      if (!lockfile.importers.has(target)) problems.push(`${name} links to ${reference}, which is not a workspace importer in the lockfile`);
      else if (!linked.has(target)) {
        linked.add(target);
        for (const [entry, locked] of lockfile.importers.get(target)) {
          const split = entry.indexOf(':');
          if (edges.includes(entry.slice(0, split))) pending.push([entry.slice(split + 1), locked.version, target]);
        }
      }
      continue;
    }
    const key = `${name}@${reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!lockfile.integrities.has(`${name}@${baseVersion(reference)}`)) problems.push(`${key} has no lockfile integrity`);
    const snapshot = lockfile.snapshots.get(key);
    if (!snapshot) { problems.push(`${key} has no lockfile snapshot`); continue; }
    for (const edge of edges) {
      for (const [dependency, dependencyReference] of snapshot[edge]) pending.push([dependency, dependencyReference, context]);
    }
  }
  const packages = [...new Set([...seen].map(splitKey).filter(([name]) => include(name)).map(([name, version]) => `${name}@${baseVersion(version)}`))].sort();
  return { packages, problems };
}
