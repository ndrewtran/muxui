import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ReferenceReadError } from './errors.mjs';

const packageRoot = resolve(import.meta.dirname, '..');

/** The entry points of an export map that carry types, as `{ key, file }` with `file` relative to the package. */
export function typedEntryPoints(manifest) {
  return Object.entries(manifest.exports)
    .filter(([, target]) => typeof target?.types === 'string')
    .map(([key, target]) => ({ key, file: target.types.replace(/^\.\//u, '') }));
}

/**
 * Lays the shipped declarations out as the package a consumer installs: a scratch directory holding the
 * manifest's name, version and export map, the `declarations` (file name to text) under `generated/`, and
 * the React types linked from this package's own install. The scratch package carries its own manifest so
 * the declarations' `@muxui/react` self-imports resolve into it and never into a `generated/` left over
 * from an earlier build, which is why the model is read from the declarations as they are emitted.
 *
 * `use({ directory, entries })` receives the real path of the scratch package and its typed entry points
 * as `{ key, file, path }`; the directory is removed afterwards.
 */
export function withStagedPackage({ declarations, manifest, reactTypesFrom = resolve(packageRoot, 'node_modules/@types') }, use) {
  // The compilers print real paths, so the directory is one.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'muxui-reference-stage-')));
  try {
    const { name, version, exports } = manifest;
    writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ name, version, type: 'module', exports }, null, 2)}\n`);
    mkdirSync(join(directory, 'generated'), { recursive: true });
    for (const [file, text] of Object.entries(declarations)) {
      if (!file.endsWith('.d.ts') || file.includes('/')) throw new ReferenceReadError('HOST', file, 'a staged declaration is a flat .d.ts file name');
      writeFileSync(join(directory, 'generated', file), text);
    }
    mkdirSync(join(directory, 'node_modules/@types'), { recursive: true });
    symlinkSync(join(reactTypesFrom, 'react'), join(directory, 'node_modules/@types/react'), 'junction');
    const entries = typedEntryPoints(manifest).map(({ key, file }) => ({ key, file, path: join(directory, file) }));
    for (const entry of entries) {
      if (!Object.hasOwn(declarations, entry.file.slice('generated/'.length))) {
        throw new ReferenceReadError('INVENTORY', entry.key, `the export map names ${entry.file}, which is not a shipped declaration`);
      }
    }
    return use({ directory, entries });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
