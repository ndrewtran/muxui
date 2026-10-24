// Reads the declarations the package ships as one set, for the tests that check what a consumer
// sees. A test that names a module's declarations by hand misses a module added later, so these read
// every generated/*.d.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { literalSpecifier, moduleSpecifiers } from '../../src/flat-modules.mjs';

const generatedDirectory = resolve(import.meta.dirname, '../../generated');

/** Every declaration file in `directory` (generated/ by default), as `{ [file name]: text }` sorted by name. */
export function generatedDeclarations(directory = generatedDirectory) {
  return Object.fromEntries(readdirSync(directory)
    .filter((file) => file.endsWith('.d.ts'))
    .sort()
    .map((file) => [file, readFileSync(resolve(directory, file), 'utf8')]));
}

/** The text of every declaration in `declarations`, one after another. */
export const joinedDeclarations = (declarations = generatedDeclarations()) => Object.values(declarations).join('\n');

// The packages a shipped declaration may name: React's types, and the package's own barrel.
const ALLOWED_PACKAGES = new Set(['react', '@muxui/react']);

/**
 * The package specifiers a declaration imports, re-exports, or names in an import type, other than
 * React and the package itself: what a consumer would need installed to read it. The package's own
 * files (relative specifiers) are not upstream.
 */
export function upstreamImports(text, label = 'declaration') {
  return moduleSpecifiers(text, 'dts', label)
    .map((node) => literalSpecifier(node).value)
    .filter((specifier) => !/^\.{0,2}\//u.test(specifier) && !ALLOWED_PACKAGES.has(specifier));
}

/**
 * The declarations a consumer sees of one family: `<name>Props`, the declaration of the component
 * itself, which names the props of its parts, and, transitively, each exported interface or type they
 * name, found in any of the `types` text. Comments are left out so that a member's description never
 * counts as the member. A name the text does not declare contributes nothing. A type the declaration file
 * keeps to itself (Menu's `MenuComponent`, which states the parts of the compound) is followed like an exported one.
 * With `root`, the compound is left out: `<name>Props` is the props of one part, the root, and only the types it names count.
 */
export function familyDeclarations(types, name, { root = false } = {}) {
  // A declaration ends where the next top-level statement or comment begins, which tsc writes at the start of a line.
  // The aliases beside it, exported or not, are other declarations and count only when it names them.
  const declaration = (identifier, kinds) => {
    const start = types.search(new RegExp(`^(?:export )?(?:${kinds}) ${identifier}\\b`, 'mu'));
    if (start === -1) return '';
    const next = types.slice(start + 1).search(/\n[A-Za-z/]/u);
    return types.slice(start, next === -1 ? undefined : start + 1 + next).replace(/\/\*[\s\S]*?\*\//gu, '');
  };
  const references = (text) => [...text.matchAll(/\b[A-Z][A-Za-z]+\b/gu)].map(([reference]) => reference);
  const seen = new Set();
  const collect = (identifier) => {
    if (seen.has(identifier)) return '';
    seen.add(identifier);
    const text = declaration(identifier, 'interface|type');
    return text + references(text).map(collect).join('\n');
  };
  const component = root ? '' : declaration(name, 'declare const');
  return [collect(`${name}Props`), component, ...references(component).map(collect)].join('\n');
}
