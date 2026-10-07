import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function exportTarget(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return undefined;
  for (const condition of ['import', 'node', 'default']) {
    const target = exportTarget(entry[condition]);
    if (target) return target;
  }
  return undefined;
}

/**
 * Resolves a release-proof tool pinned by the React package's devDependencies
 * (`manifest` is its package.json), so release proof adds no dependency and the
 * clean consumers keep only the packed runtime graph. Returns the pinned
 * version and the tool's entry URL. `fail(code, detail)` raises the caller's error.
 */
export function resolvePinnedTool({ packageRoot, manifest, name, fail }) {
  const requireFromReact = createRequire(join(packageRoot, 'package.json'));
  const manifestPath = requireFromReact.resolve(`${name}/package.json`);
  const toolManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (toolManifest.version !== manifest.devDependencies?.[name]) {
    fail('R1_EXIT_PACK_PROOF_TOOL_UNAVAILABLE', `expected the pinned ${name} ${manifest.devDependencies?.[name]}, found ${toolManifest.version}`);
  }
  const relative = exportTarget(toolManifest.exports?.['.']) ?? toolManifest.main;
  return { version: toolManifest.version, url: pathToFileURL(join(dirname(manifestPath), relative)).href };
}
