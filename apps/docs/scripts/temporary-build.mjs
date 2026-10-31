import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const buildRoot = resolve(import.meta.dirname, '../.astro');

// Keep output on the docs filesystem: Astro moves prerender assets with rename(),
// which cannot cross devices. Each build owns only its unique directory, not .astro.
export async function withTemporaryBuildDirectory(prefix, run) {
	await mkdir(buildRoot, { recursive: true });
	const directory = await mkdtemp(join(buildRoot, prefix));
	try {
		return await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
