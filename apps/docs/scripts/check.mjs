import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const docsRoot = resolve(import.meta.dirname, '..');
const astroCli = resolve(docsRoot, 'node_modules/astro/bin/astro.mjs');

function runNode(label, args) {
	const result = spawnSync(process.execPath, args, {
		cwd: docsRoot,
		env: process.env,
		stdio: 'inherit',
	});
	if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
	if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

const outputDirectory = await mkdtemp(join(tmpdir(), 'muxui-docs-check-'));
try {
	runNode('Astro type check', [astroCli, 'check']);
	runNode('Catalog docs contract', [resolve(import.meta.dirname, 'check-docs.mjs')]);
	runNode('Astro build', [astroCli, 'build', '--outDir', outputDirectory]);
	runNode('Rendered source contract', [resolve(import.meta.dirname, 'check-rendered-source.mjs'), outputDirectory]);
	runNode('Token path contract', ['--experimental-strip-types', resolve(import.meta.dirname, 'check-token-path.mjs'), outputDirectory]);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await rm(outputDirectory, { recursive: true, force: true });
}
