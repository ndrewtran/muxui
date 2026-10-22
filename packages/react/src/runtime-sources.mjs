import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * The one list of the fixed-registry runtime modules: the sources that declare the 53 canonical
 * R1 families' exports (`export const <Name>`). The supplemental modules are not here; their
 * paths come from supplemental-mapping.mjs. collections.mjs re-exports the collection families
 * and declares none, so it is not here either. Moving a module to TypeScript renames its entry
 * here and nowhere else: generation, the R1.5 contract checks, and agent-eval read this list.
 * Order is the discovery order: the first module declaring an export owns it.
 */
export const runtimeSourcePaths = Object.freeze([
  'packages/react/src/button.ts',
  'packages/react/src/components.ts',
  'packages/react/src/fields.ts',
  'packages/react/src/calendar.ts',
  'packages/react/src/color-area.ts',
  'packages/react/src/color-field.ts',
  'packages/react/src/color-picker.ts',
  'packages/react/src/color-slider.ts',
  'packages/react/src/color-swatch-picker.mjs',
  'packages/react/src/color-swatch.ts',
  'packages/react/src/color-wheel.ts',
  'packages/react/src/combo-box.mjs',
  'packages/react/src/grid-list.mjs',
  'packages/react/src/list-box.mjs',
  'packages/react/src/menu.mjs',
  'packages/react/src/radio-group.mjs',
  'packages/react/src/select.mjs',
  'packages/react/src/slider.mjs',
  'packages/react/src/table.mjs',
  'packages/react/src/tabs.mjs',
  'packages/react/src/tag-group.mjs',
  'packages/react/src/toggle-button-group.mjs',
  'packages/react/src/token-field.mjs',
  'packages/react/src/toolbar.ts',
  'packages/react/src/tree.mjs',
  'packages/react/src/virtualizer.mjs',
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
