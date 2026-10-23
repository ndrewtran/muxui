import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatJson } from './json.mjs';
import { readReference } from './read.mjs';

/** The declarations among the generator's outputs: exactly the files a consumer's compiler reads. */
export const declarationOutputs = (outputs) => Object.fromEntries([...outputs]
  .filter(([name]) => name.endsWith('.d.ts'))
  .sort(([left], [right]) => (left < right ? -1 : 1)));

/**
 * The text of every file in `packages/react/reference/`, by name: `inventory.json` and one file per owner.
 * Read from the declarations as they are emitted now, so a stale `generated/` cannot be what is described.
 */
export function referenceOutputs({ outputs, manifest, families, host }) {
  const { inventory, files } = readReference({ declarations: declarationOutputs(outputs), manifest, host, families });
  return new Map([['inventory.json', formatJson(inventory)], ...[...files].map(([name, file]) => [name, formatJson(file)])]);
}

/**
 * Writes `directory` (or, when `checking`, fails on any drift), holding exactly the `expected` files.
 * Drift is reported as `MUXUI_REACT_GENERATED_DRIFT` with the file, as for generated/ and api/.
 */
export async function syncFiles({ directory, expected, checking, label = 'reference' }) {
  const present = await readdir(directory).catch(() => []);
  if (checking) {
    for (const [name, text] of expected) {
      if (await readFile(resolve(directory, name), 'utf8').catch(() => null) !== text) {
        throw new Error(`MUXUI_REACT_GENERATED_DRIFT: ${label}/${name}`);
      }
    }
    const unexpected = present.filter((name) => !expected.has(name));
    if (unexpected.length > 0) throw new Error(`MUXUI_REACT_GENERATED_DRIFT: ${label}/${unexpected[0]} is not a declaration reference output`);
    return;
  }
  await mkdir(directory, { recursive: true });
  for (const [name, text] of expected) await writeFile(resolve(directory, name), text);
  for (const name of present.filter((entry) => !expected.has(entry))) await rm(resolve(directory, name), { recursive: true, force: true });
}

/**
 * Writes `packages/react/reference/` (or, when `checking`, fails on any drift), holding exactly the reference
 * files. The directory is a projection of the shipped declarations; it is not in the package's `files`.
 */
export const syncDeclarationReference = ({ packageRoot, outputs, manifest, families, checking, host }) => syncFiles({
  directory: resolve(packageRoot, 'reference'),
  expected: referenceOutputs({ outputs, manifest, families, host }),
  checking,
});
