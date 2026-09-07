import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import reference from './fixtures/r1-6-dependency-reference.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '../../..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const readJson = async (path) => JSON.parse(await read(path));

test('accepted dependency pins retain exact lockfile integrity and unchanged licenses', async () => {
  const lockfile = await read(reference.lockfile);
  const packageEntries = lockfile.split('\npackages:\n')[1]?.split('\nsnapshots:\n')[0];
  assert.ok(packageEntries, 'pnpm lockfile declares its resolved package records');
  for (const entry of [...reference.records, ...reference.transitiveEditorRecords]) {
    if (entry.owner) {
      const manifest = await readJson(entry.owner);
      assert.equal(manifest.dependencies[entry.package], entry.version, entry.package);
    }
    const header = `${entry.package}@${entry.version}`;
    const block = packageEntries.split('\n\n').find((candidate) => candidate.split('\n').some((line) => line === `  '${header}':` || line === `  ${header}:`));
    assert.ok(block, `${header} has an exact package record`);
    assert.ok(block.includes(`integrity: ${entry.integrity}`), `${header} retains its integrity`);
    const license = await read(entry.licenseFile);
    assert.equal(`sha256:${createHash('sha256').update(license).digest('hex')}`, entry.licenseSha256, `${header} retains its license`);
  }
  const editorVersions = [...packageEntries.matchAll(/^  '@tiptap\/[^']+@([^']+)':$/gmu)].map((match) => match[1]);
  assert.equal(editorVersions.length, 32);
  assert.equal(reference.records.filter((entry) => entry.package.startsWith('@tiptap/')).length + reference.transitiveEditorRecords.length, editorVersions.length);
  assert.deepEqual([...new Set(editorVersions)], ['3.22.3'], 'the entire internal editor closure uses the accepted version');
  assert.doesNotMatch(lockfile, /(?:@tale-ui\/|@tailwindcss\/|tailwindcss@)/u, 'Tale and Tailwind remain outside the Mux workspace lockfile');
});

test('supplemental dependency allowances and isolated exports agree with the accepted boundary', async () => {
  const mapping = await readJson('catalog/react-r1-6/donor-crosswalk.json');
  const manifest = await readJson('packages/react/package.json');
  for (const edge of mapping.dependencyBoundary.allowedNewInternalEdges) {
    assert.equal(manifest.dependencies[edge.package], edge.version, edge.package);
    assert.ok(reference.records.some((entry) => entry.package === edge.package && entry.version === edge.version));
    for (const family of edge.families) {
      assert.ok(mapping.supplemental.find((entry) => entry.family === family)?.internalDependencyAllowances.includes(edge.package), `${edge.package}: ${family}`);
    }
  }
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
      assert.ok(Object.keys(owner[edge] ?? {}).every((name) => !name.startsWith('@tale-ui/') && !name.startsWith('@tailwindcss/') && name !== 'tailwindcss'), `${path}: ${edge}`);
    }
  }
});
