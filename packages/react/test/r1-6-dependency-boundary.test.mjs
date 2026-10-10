import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import reference from './fixtures/r1-6-dependency-reference.json' with { type: 'json' };
import { exactLockedProblems, lockedClosure, readLockfile } from './support/locked-dependencies.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const readJson = async (path) => JSON.parse(await read(path));
const lockfile = await readLockfile();
const reactManifest = await readJson('packages/react/package.json');
const tokensManifest = await readJson('packages/tokens/package.json');
const isShiki = (name) => name === 'shiki' || name.startsWith('@shikijs/');
const bothEdges = ['dependencies', 'optionalDependencies'];
const nameOf = (key) => key.slice(0, key.indexOf('@', 1));
const mergeWalks = (walks) => ({ packages: [...new Set(walks.flatMap(({ packages }) => packages))].sort(), problems: walks.flatMap(({ problems }) => problems) });

// Versions come from the lockfile; the reference file only retains license texts.
// Each walk needs a snapshot and an integrity for everything it reaches.
function closures(lock) {
  const npmDependencies = (manifest) => Object.keys(manifest.dependencies).filter((name) => !manifest.dependencies[name].startsWith('workspace:'));
  const walkAll = (importer, manifest, options) => npmDependencies(manifest).map((name) => lockedClosure(lock, importer, name, options));
  return {
    runtime: mergeWalks([...walkAll('packages/react', reactManifest, { edges: bothEdges }), ...walkAll('packages/tokens', tokensManifest, { edges: bothEdges })]),
    tiptap: mergeWalks(npmDependencies(reactManifest).filter((name) => name.startsWith('@tiptap/'))
      .map((name) => lockedClosure(lock, 'packages/react', name, { edges: bothEdges, include: (dependency) => dependency.startsWith('@tiptap/') }))),
    motion: lockedClosure(lock, 'packages/react', 'motion'),
    shiki: lockedClosure(lock, 'packages/react', 'shiki', { include: isShiki }),
  };
}
const { runtime, tiptap, motion, shiki } = closures(lockfile);

test('runtime dependencies are exact and locked, with one editor version and no Tailwind', async () => {
  assert.deepEqual(exactLockedProblems(lockfile, 'packages/react', reactManifest), []);
  assert.deepEqual(exactLockedProblems(lockfile, 'packages/tokens', tokensManifest), []);
  assert.deepEqual(runtime.problems, [], 'every package the runtime dependencies reach has a snapshot and an integrity');
  const editorVersions = new Set(tiptap.packages.map((key) => key.slice(key.indexOf('@', 1) + 1)));
  assert.deepEqual([...editorVersions], [reactManifest.dependencies['@tiptap/core']], 'the entire internal editor closure uses the accepted version');
  assert.doesNotMatch(await read('pnpm-lock.yaml'), /(?:@tailwindcss\/|tailwindcss@)/u, 'Tailwind remains outside the Mux workspace lockfile');
});

test('closure checks report a missing snapshot or integrity anywhere in a closure', () => {
  const without = (map, predicate) => new Map([...map].filter(([key]) => !predicate(key)));
  const reports = (closure, key, problem) => closure.problems.some((entry) => entry.startsWith(key) && entry.endsWith(problem));
  const transitive = motion.packages.find((key) => nameOf(key) !== 'motion');
  assert.ok(transitive, 'motion reaches a transitive package');
  const motionRoot = `motion@${reactManifest.dependencies.motion}`;
  // A deleted record must not read as a dependency-free leaf.
  const missingTransitiveSnapshot = closures({ ...lockfile, snapshots: without(lockfile.snapshots, (key) => key.startsWith(transitive)) });
  assert.ok(reports(missingTransitiveSnapshot.motion, transitive, 'has no lockfile snapshot'));
  assert.ok(reports(missingTransitiveSnapshot.runtime, transitive, 'has no lockfile snapshot'));
  const missingTransitiveIntegrity = closures({ ...lockfile, integrities: without(lockfile.integrities, (key) => key === transitive) });
  assert.ok(reports(missingTransitiveIntegrity.motion, transitive, 'has no lockfile integrity'));
  assert.ok(reports(missingTransitiveIntegrity.runtime, transitive, 'has no lockfile integrity'));
  const missingRootSnapshot = closures({ ...lockfile, snapshots: without(lockfile.snapshots, (key) => key.startsWith(motionRoot)) });
  assert.ok(reports(missingRootSnapshot.motion, motionRoot, 'has no lockfile snapshot'));
  assert.ok(reports(missingRootSnapshot.runtime, motionRoot, 'has no lockfile snapshot'));
});

test('every disclosed runtime package keeps its unchanged license text', async () => {
  const direct = [reactManifest, tokensManifest].flatMap(({ dependencies }) => Object.keys(dependencies).filter((name) => !dependencies[name].startsWith('workspace:')));
  const disclosed = new Set([...direct, ...[...tiptap.packages, ...motion.packages, ...shiki.packages].map(nameOf)]);
  for (const name of disclosed) {
    const entry = reference.licenses[name] ?? reference.licenses[`${name.split('/')[0]}/`];
    assert.ok(entry, `${name} has a retained license text`);
    const license = await read(entry.file);
    assert.equal(`sha256:${createHash('sha256').update(license).digest('hex')}`, entry.sha256, `${name} retains its license`);
  }
});

test('Shiki stays one private dependency with retained grammar, engine and WASM notices', async () => {
  assert.ok(reactManifest.dependencies.shiki);
  assert.ok(Object.keys(reactManifest.dependencies).every((name) => !name.startsWith('@shikijs/')));
  assert.ok(Object.keys(reactManifest.exports).every((name) => !/shiki|highlight|code-block/u.test(name)));
  assert.ok(shiki.packages.includes(`shiki@${reactManifest.dependencies.shiki}`), 'the lockfile resolves the declared Shiki');
  const notice = await read('packages/react/NOTICE');
  for (const key of shiki.packages) assert.ok(notice.includes(key), `${key} disclosed`);
  assert.match(await read('packages/react/licenses/shiki-oniguruma.NOTICES.txt'), /Copyright.*Kosako|Copyright.*K\.Kosako/us);
  const types = await read('packages/react/generated/index.d.ts');
  assert.doesNotMatch(types, /shiki|Highlighter|GrammarState/u);
});

test('motion closure is disclosed in NOTICE and resolves the existing React peer', async () => {
  assert.ok(motion.packages.includes(`motion@${reactManifest.dependencies.motion}`), 'the lockfile resolves the declared motion');
  assert.equal(reactManifest.peerDependencies.react, '>=19.2.0 <20');
  assert.equal(reactManifest.peerDependencies['react-dom'], '>=19.2.0 <20');
  // motion's locked identity names the React and React DOM it resolves against.
  const resolved = lockfile.importers.get('packages/react').get('dependencies:motion').version;
  assert.ok(resolved.includes(`(react@${reactManifest.devDependencies.react})`), 'motion resolves react to the existing peer');
  assert.ok(resolved.includes(`react-dom@${reactManifest.devDependencies['react-dom']}`), 'motion resolves react-dom to the existing peer');
  const notice = await read('packages/react/NOTICE');
  for (const key of motion.packages) assert.ok(notice.includes(key), `${key} is disclosed in NOTICE`);
});

test('supplemental dependencies and isolated exports stay within the accepted boundary', async () => {
  const manifest = await readJson('packages/react/package.json');
  assert.equal(manifest.private, true);
  assert.ok(manifest.files.includes('licenses'));
  assert.equal(manifest.exports['./text-editor'].default, './generated/text-editor.mjs');
  assert.equal(manifest.exports['./markdown'].default, './generated/markdown.mjs');
  const rootRuntime = await read('packages/react/generated/index.mjs');
  const rootTypes = await read('packages/react/generated/index.d.ts');
  assert.doesNotMatch(rootRuntime, /(?:text-editor|markdown|@tiptap|marked)/u);
  assert.doesNotMatch(rootTypes, /(?:TextEditor|Markdown|@tiptap|marked)/u);
  for (const path of ['packages/react/package.json', 'packages/tokens/package.json', 'apps/scale/package.json']) {
    const owner = await readJson(path);
    for (const edge of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      assert.ok(Object.keys(owner[edge] ?? {}).every((name) => !name.startsWith('@tailwindcss/') && name !== 'tailwindcss'), `${path}: ${edge}`);
    }
  }
});
