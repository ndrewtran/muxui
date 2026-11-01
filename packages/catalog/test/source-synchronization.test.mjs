import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { compileCatalog } from '../src/compiler.mjs';
import { synchronizedSourceManifest } from '../src/completeness.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const committedList = join(repositoryRoot, 'packages/catalog/catalog-sources.json');

// React generation compiles the catalog before the catalog generator rewrites its source list, so the compile
// must follow the records on disk, not the list the last generation committed.
test('a compile of the synchronized inventory follows a record rename and removal the committed list lacks', async () => {
  const committedBytes = await readFile(committedList, 'utf8');
  const root = await mkdtemp(join(tmpdir(), 'muxui-catalog-sync-'));
  try {
    // Everything but catalog/ links to the checkout; catalog/ is a scratch copy the test may edit.
    for (const name of (await readdir(repositoryRoot)).filter((entry) => entry !== '.git' && entry !== 'catalog')) {
      await symlink(join(repositoryRoot, name), join(root, name));
    }
    await cp(join(repositoryRoot, 'catalog'), join(root, 'catalog'), { recursive: true });
    const guides = join(root, 'catalog/guides');
    await rename(join(guides, 'lifecycle.json'), join(guides, 'lifecycle-renamed.json'));
    await rm(join(guides, 'discovery.json'));
    await rm(join(guides, 'discovery.md'));

    await assert.rejects(compileCatalog({ repositoryRoot: root }), { code: 'ENOENT' });

    const manifest = await synchronizedSourceManifest(root);
    const paths = manifest.records.map(({ path }) => path);
    assert.ok(paths.includes('catalog/guides/lifecycle-renamed.json'));
    assert.ok(!paths.includes('catalog/guides/lifecycle.json'));
    assert.ok(!paths.includes('catalog/guides/discovery.json'));

    const { bundle } = await compileCatalog({ repositoryRoot: root, sourceManifest: manifest });
    const lifecycle = bundle.artifacts.find(({ id }) => id === 'muxui:guide:lifecycle');
    assert.equal(lifecycle.source.record, 'catalog/guides/lifecycle-renamed.json');
    assert.equal(bundle.artifacts.some(({ id }) => id === 'muxui:guide:discovery'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  // Deriving the inventory never writes the committed list; only the catalog generator does.
  assert.equal(await readFile(committedList, 'utf8'), committedBytes);
});
