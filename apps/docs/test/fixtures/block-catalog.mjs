import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { compileCatalog } = createRequire(import.meta.url)('@muxui/catalog/compiler');

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const patternsDirectory = resolve(import.meta.dirname, 'patterns');
const fixturePrefix = 'apps/docs/test/fixtures/patterns/';

/** Every file under `directory` as [path relative to it, text]. */
async function filesUnder(directory, prefix = '') {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = `${prefix}${entry.name}`;
		if (entry.isDirectory()) files.push(...await filesUnder(join(directory, entry.name), `${path}/`));
		else files.push([path, await readFile(join(directory, entry.name), 'utf8')]);
	}
	return files;
}

/**
 * Compiles the real catalog with its shipped patterns swapped for the test-only
 * patterns beside this file, and returns the compile result (`{ bundle, ... }`).
 *
 * The fixtures are staged under `fixture/` in a root of symlinks to the repository, so
 * nothing in the checkout changes. They give the rail's parity test more than one block,
 * in both pattern groups, whatever the shipped catalog holds.
 */
export async function compileBlockFixtureCatalog() {
	const root = await mkdtemp(join(tmpdir(), 'muxui-docs-blocks-'));
	try {
		for (const name of await readdir(repositoryRoot)) {
			if (name !== '.git') await symlink(join(repositoryRoot, name), join(root, name));
		}
		const staged = [];
		for (const [path, text] of await filesUnder(patternsDirectory)) {
			const target = `fixture/${path}`;
			await mkdir(join(root, target, '..'), { recursive: true });
			await writeFile(join(root, target), text.replaceAll(fixturePrefix, 'fixture/'));
			if (path.endsWith('.json')) staged.push({ family: path.endsWith('artifact.json') ? 'pattern' : 'example', path: target });
		}
		const manifest = JSON.parse(await readFile(join(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
		manifest.records = [...manifest.records.filter(({ path }) => !path.startsWith('catalog/patterns/')), ...staged];
		await writeFile(join(root, 'catalog-sources.json'), JSON.stringify(manifest));
		return await compileCatalog({ repositoryRoot: root, sourceManifestPath: 'catalog-sources.json' });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
