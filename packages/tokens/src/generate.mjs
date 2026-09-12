import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseJsonStrict } from '@muxui/schema';
import { compileTokenGraph, validateSourceCrosswalk } from './index.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const sourcePath = resolve(repositoryRoot, 'catalog/tokens/default-theme.json');
const source = parseJsonStrict(await readFile(sourcePath, 'utf8'));

// The canonical theme is the source of truth. Keep this command as a focused
// integrity check; generated projections remain owned by their packages.
const crosswalk = validateSourceCrosswalk(source);
if (crosswalk.status !== 'absent') {
  throw new Error('MUXUI_TOKEN_SOURCE_CROSSWALK_UNEXPECTED: canonical theme must not carry import metadata');
}
if (source.extensions !== undefined) {
  throw new Error('MUXUI_TOKEN_SOURCE_EXTENSIONS_UNEXPECTED: canonical theme must not carry migration metadata');
}
const graph = compileTokenGraph(source);
if (Object.keys(graph.tokens).length !== Object.keys(source.tokens).length) {
  throw new Error('MUXUI_TOKEN_GRAPH_INCOMPLETE: compiled graph does not contain every canonical token');
}

console.log(`[tokens] canonical theme integrity verified (${Object.keys(source.tokens).length} tokens)`);
