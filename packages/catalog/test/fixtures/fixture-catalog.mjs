import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileCatalog } from '../../src/compiler.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixtureDirectory = resolve(import.meta.dirname, 'patterns/poster-grid');
const fixturePrefix = 'packages/catalog/test/fixtures/patterns/poster-grid/';

/** One text per fixture file, keyed by its path inside the poster-grid directory. */
async function fixtureFiles(directory = fixtureDirectory, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      for (const [nested, text] of await fixtureFiles(join(directory, entry.name), `${path}/`)) {
        files.set(nested, text);
      }
    } else {
      files.set(path, await readFile(join(directory, entry.name), 'utf8'));
    }
  }
  return files;
}

// The sources the poster-grid fixture needs, for fast negative compiles.
const MINIMAL_SOURCES = /^catalog\/(?:capabilities\/|tokens\/|components\/(?:button|grid-list|virtualizer)\/)/u;

/**
 * Compiles the real catalog (or, with `minimal`, only the sources the fixture
 * needs) plus the test-only poster-grid pattern. The fixture is staged under
 * `fixture/` in a root of symlinks to the repository, so `edit` can change
 * any fixture file (by its poster-grid-relative path) without touching the
 * checkout. Returns the compile result.
 *
 * The fixture shares the shipped poster grid's pattern and example ids, so it
 * stands in for the shipped `catalog/patterns` records: they are left out of
 * the compile. `fixture: false` compiles the real catalog without any pattern.
 */
export async function compileFixtureCatalog({ edit = () => {}, minimal = false, fixture = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'muxui-pattern-fixture-'));
  try {
    for (const name of await readdir(repositoryRoot)) {
      if (name !== '.git') await symlink(join(repositoryRoot, name), join(root, name));
    }
    const files = fixture ? await fixtureFiles() : new Map();
    edit(files);
    const staged = [];
    for (const [path, text] of files) {
      const target = `fixture/${path}`;
      await mkdir(join(root, target, '..'), { recursive: true });
      await writeFile(join(root, target), text.replaceAll(fixturePrefix, 'fixture/'));
      if (path.endsWith('.json')) {
        staged.push({ family: path === 'artifact.json' ? 'pattern' : 'example', path: target });
      }
    }
    const manifest = JSON.parse(await readFile(
      join(repositoryRoot, 'packages/catalog/catalog-sources.json'),
      'utf8',
    ));
    manifest.records = manifest.records.filter(({ path }) => !path.startsWith('catalog/patterns/'));
    if (minimal) manifest.records = manifest.records.filter(({ path }) => MINIMAL_SOURCES.test(path));
    manifest.records.push(...staged);
    await writeFile(join(root, 'catalog-sources.json'), JSON.stringify(manifest));
    return await compileCatalog({ repositoryRoot: root, sourceManifestPath: 'catalog-sources.json' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
