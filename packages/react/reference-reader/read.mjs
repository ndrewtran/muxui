import { ReferenceReadError } from './errors.mjs';
import { readGraph } from './graph.mjs';
import { typescript7Host } from './host-typescript7.mjs';
import { buildReference } from './model.mjs';
import { withStagedPackage } from './stage.mjs';

/** The source each shipped declaration file was generated from, by module, read from its `@generated-from` header. */
export function declarationSources(declarations) {
  return new Map(Object.entries(declarations).map(([file, text]) => {
    const source = /^\/\/ @generated-from: (\S+)$/mu.exec(text.split('\n', 3).join('\n'))?.[1];
    if (source === undefined) throw new ReferenceReadError('INVENTORY', file, 'a shipped declaration has no @generated-from header');
    return [file.replace(/\.d\.ts$/u, ''), source];
  }));
}

/**
 * Reads the shipped declarations into the declaration graph.
 * @param {object} options
 * @param {Record<string, string>} options.declarations The text of every shipped `.d.ts` file, by file name.
 * @param {{ name: string, version: string, exports: Record<string, unknown> }} options.manifest The package manifest.
 * @param {import('./host.mjs').Host} [options.host] The compiler host; TypeScript 7 unless a test says otherwise.
 */
export function readDeclarationGraph({ declarations, manifest, host = typescript7Host }) {
  return withStagedPackage({ declarations, manifest }, ({ directory, entries }) => host.open(
    { directory, files: entries.map(({ path }) => path) },
    (session) => readGraph(session, entries),
  ));
}

/**
 * Reads the shipped declarations into the reference: one file per owner and the export inventory.
 * @param {Parameters<typeof readDeclarationGraph>[0] & { families: Parameters<typeof buildReference>[0]['families'], exceptions?: Parameters<typeof buildReference>[0]['exceptions'], untypedEntries?: Parameters<typeof buildReference>[0]['untypedEntries'] }} options
 */
export function readReference({ declarations, manifest, host, families, exceptions, untypedEntries }) {
  const graph = readDeclarationGraph({ declarations, manifest, host });
  return buildReference({ graph, families, sources: declarationSources(declarations), manifest, exceptions, untypedEntries });
}
