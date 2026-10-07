import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileCatalog } from '@muxui/catalog/compiler';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const fixtureDirectory = 'packages/catalog/test/fixtures/patterns/poster-grid';

/** Compiles the real catalog plus the catalog package's test-only poster-grid pattern. */
export async function compileFixtureBundle() {
  const manifest = JSON.parse(await readFile(
    join(repositoryRoot, 'packages/catalog/catalog-sources.json'),
    'utf8',
  ));
  manifest.records.push(
    { family: 'pattern', path: `${fixtureDirectory}/artifact.json` },
    { family: 'example', path: `${fixtureDirectory}/examples/react/css-grid.example.json` },
    { family: 'example', path: `${fixtureDirectory}/examples/react/virtualized.example.json` },
  );
  const directory = await mkdtemp(join(tmpdir(), 'muxui-pattern-fixture-'));
  try {
    const sourceManifestPath = join(directory, 'catalog-sources.json');
    await writeFile(sourceManifestPath, JSON.stringify(manifest));
    return (await compileCatalog({ repositoryRoot, sourceManifestPath })).bundle;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
