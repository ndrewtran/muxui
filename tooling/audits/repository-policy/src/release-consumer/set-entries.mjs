// Isolated-consumer check for the whole publish set. Run from a consumer that installed every tarball:
// `node set-entries.mjs '<package names JSON>'`. Imports every public JavaScript entry of each installed package,
// resolves every other entry to a file, and prints the names each importable module exports, keyed by specifier,
// for the descriptor export audit.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const targetOf = (value) => (typeof value === 'string' ? value : value?.default ?? Object.values(value ?? {}).map(targetOf).find(Boolean));
const exportNames = {};
const resolved = [];
for (const name of JSON.parse(process.argv[2])) {
  const { exports } = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8'));
  for (const [subpath, entry] of Object.entries(exports)) {
    // A pattern entry has no single specifier; the pack audit holds its files.
    if (subpath.includes('*')) continue;
    const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
    if (/\.m?js$/u.test(targetOf(entry))) {
      exportNames[specifier] = Object.keys(await import(specifier));
    } else if (!existsSync(fileURLToPath(import.meta.resolve(specifier)))) {
      throw new Error(`${specifier} does not resolve to an installed file`);
    } else {
      resolved.push(specifier);
    }
  }
}
console.log(JSON.stringify({ exportNames, resolved }));
