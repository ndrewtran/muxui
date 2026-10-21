import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * The one list of the fixed-registry runtime modules: the sources that declare the 53 canonical
 * R1 families' exports (`export const <Name>`). The supplemental modules are not here; their
 * paths come from supplemental-mapping.mjs. Moving a module to TypeScript renames its entry
 * here and nowhere else: generation, the R1.5 contract checks, and agent-eval read this list.
 * Order is the discovery order: the first module declaring an export owns it.
 */
export const runtimeSourcePaths = Object.freeze([
  'packages/react/src/button.ts',
  'packages/react/src/components.ts',
  'packages/react/src/fields.ts',
  'packages/react/src/collections.mjs',
  'packages/react/src/overlays.ts',
]);

/** The registry modules' text, by repository-relative path. */
export async function readRuntimeSources(repositoryRoot) {
  return Object.fromEntries(await Promise.all(runtimeSourcePaths.map(async (path) => (
    [path, await readFile(resolve(repositoryRoot, path), 'utf8')]
  ))));
}

/** The registry path of the module that declares `export const <exportName>`, or undefined. */
export function runtimeSourceFor(sources, exportName) {
  return Object.entries(sources)
    .find(([, source]) => new RegExp(`export\\s+const\\s+${exportName}\\b`, 'u').test(source))?.[0];
}
