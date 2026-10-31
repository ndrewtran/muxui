import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { withTemporaryBuildDirectory } from './temporary-build.mjs';

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

try {
	await withTemporaryBuildDirectory('muxui-docs-check-', (outputDirectory) => {
		runNode('Astro type check', [astroCli, 'check']);
		runNode('Temporary docs build lifecycle', ['--test', resolve(docsRoot, 'test/temporary-build.test.mjs')]);
		runNode('Catalog docs contract', [resolve(import.meta.dirname, 'check-docs.mjs')]);
		runNode('Component navigation categories', ['--test', resolve(docsRoot, 'test/component-navigation.test.mjs')]);
		runNode('Component reference projection', ['--test', resolve(docsRoot, 'test/component-reference.test.mjs')]);
		runNode('Typed API reference view', ['--test', resolve(docsRoot, 'test/api-reference.test.mjs')]);
		runNode('Guide links to other families', ['--test', resolve(docsRoot, 'test/guide-links.test.mjs')]);
		runNode('Installation tested profile', ['--test', resolve(docsRoot, 'test/compatibility-profile.test.mjs')]);
		runNode('Independence of the Styling reading', ['--test', resolve(docsRoot, 'test/styling-independence.test.mjs')]);
		runNode('Versioned Styling page script', ['--test', resolve(docsRoot, 'test/styling-script-version.test.mjs')]);
		runNode('Blocks loader parity and drift guard', ['--test', resolve(docsRoot, 'test/blocks-loader.test.mjs'), resolve(docsRoot, 'test/authored-pattern-reference.test.mjs')]);
		runNode('Astro build', [astroCli, 'build', '--outDir', outputDirectory]);
		runNode('Rendered source contract', [resolve(import.meta.dirname, 'check-rendered-source.mjs'), outputDirectory]);
		runNode('Component reference contract', [resolve(import.meta.dirname, 'check-component-sections.mjs'), outputDirectory]);
		runNode('Legacy part anchors', [resolve(import.meta.dirname, 'check-legacy-anchors.mjs'), outputDirectory]);
		runNode('Page mutations fail the checker', [resolve(import.meta.dirname, 'check-page-mutations.mjs'), outputDirectory]);
		runNode('Ledger record pins', [resolve(import.meta.dirname, 'check-reference-records.mjs'), outputDirectory]);
		runNode('Shared guidance contract', [resolve(import.meta.dirname, 'check-shared-guidance.mjs'), outputDirectory]);
		runNode('Blocks contract', [resolve(import.meta.dirname, 'check-blocks.mjs'), outputDirectory]);
		runNode('Navigation contract', [resolve(import.meta.dirname, 'check-navigation.mjs'), outputDirectory]);
		runNode('Token path contract', ['--experimental-strip-types', resolve(import.meta.dirname, 'check-token-path.mjs'), outputDirectory]);
		runNode('Reference mutations fail the checks', [resolve(import.meta.dirname, 'check-reference-mutations.mjs')]);
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
