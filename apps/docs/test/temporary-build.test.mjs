import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const helper = new URL('../scripts/temporary-build.mjs', import.meta.url).href;
const buildRoot = resolve(import.meta.dirname, '../.astro');

for (const prefix of ['muxui-docs-check-', 'muxui-reference-mutations-']) {
	for (const outcome of ['success', 'sync failure', 'async failure']) {
		test(`${prefix} uses the docs filesystem and cleans up after ${outcome}`, async () => {
			const systemTemp = await mkdtemp(join(tmpdir(), 'muxui-docs-test-'));
			try {
				await writeFile(join(systemTemp, 'unrelated'), 'keep');
				// A fresh process has an unrelated cwd and system temp. Exercise the same
				// allocation and finally cleanup that both real build scripts use.
				const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { withTemporaryBuildDirectory } from ${JSON.stringify(helper)};
const buildRoot = ${JSON.stringify(buildRoot)};
const prefix = ${JSON.stringify(prefix)};
const outcome = ${JSON.stringify(outcome)};
const seen = [];
const missing = (path) => assert.rejects(stat(path), { code: 'ENOENT' });
async function inspect(directory) {
	seen.push(directory);
	assert.equal(dirname(directory), buildRoot);
	assert.notEqual(dirname(directory), tmpdir());
	assert.ok(directory.startsWith(join(buildRoot, prefix)));
	assert.equal((await stat(directory)).dev, (await stat(buildRoot)).dev);
	// Like the mutation build, keep a repository mirror beside dist. A real
	// rename of a prerender asset into dist must work and leave the mirror intact.
	await mkdir(join(directory, 'repository'));
	await writeFile(join(directory, 'repository', 'reference'), 'mirror');
	await mkdir(join(directory, 'dist'));
	await writeFile(join(directory, 'print.css'), 'print');
	await rename(join(directory, 'print.css'), join(directory, 'dist', 'print.css'));
	assert.equal(await readFile(join(directory, 'repository', 'reference'), 'utf8'), 'mirror');
}
if (outcome === 'success') {
	const value = await withTemporaryBuildDirectory(prefix, async (first) => {
		await inspect(first);
		await withTemporaryBuildDirectory(prefix, async (second) => {
			await inspect(second);
			assert.notEqual(first, second);
		});
		await missing(seen[1]);
		assert.equal(await readFile(join(first, 'dist', 'print.css'), 'utf8'), 'print');
		return 'build result';
	});
	assert.equal(value, 'build result');
} else {
	const failure = new Error('build failed');
	await assert.rejects(withTemporaryBuildDirectory(prefix, outcome === 'sync failure'
		? (directory) => { seen.push(directory); throw failure; }
		: async (directory) => { await inspect(directory); throw failure; }), (error) => error === failure);
}
for (const directory of seen) await missing(directory);
assert.ok((await stat(buildRoot)).isDirectory());
console.log(JSON.stringify({ prefix, outcome, seen, buildDevice: (await stat(buildRoot)).dev, systemTemp: tmpdir(), systemTempDevice: (await stat(tmpdir())).dev }));
`], { cwd: systemTemp, env: { ...process.env, TMPDIR: systemTemp, TMP: systemTemp, TEMP: systemTemp }, encoding: 'utf8' });
				assert.ifError(result.error);
				assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
				console.log(result.stdout.trim());
				assert.equal(await readFile(join(systemTemp, 'unrelated'), 'utf8'), 'keep');
			} finally {
				await rm(systemTemp, { recursive: true, force: true });
			}
		});
	}
}
