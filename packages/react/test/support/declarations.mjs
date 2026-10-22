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
 * counts as the member. A name the text does not declare contributes nothing.
 */
export function familyDeclarations(types, name) {
  const declaration = (identifier, kinds) => {
    const start = types.search(new RegExp(`^export (?:${kinds}) ${identifier}\\b`, 'mu'));
    const end = types.indexOf('\nexport ', start + 1);
    return start === -1 ? '' : types.slice(start, end === -1 ? undefined : end).replace(/\/\*[\s\S]*?\*\//gu, '');
  };
  const references = (text) => [...text.matchAll(/\b[A-Z][A-Za-z]+\b/gu)].map(([reference]) => reference);
  const seen = new Set();
  const collect = (identifier) => {
    if (seen.has(identifier)) return '';
    seen.add(identifier);
    const text = declaration(identifier, 'interface|type');
    return text + references(text).map(collect).join('\n');
  };
  const component = declaration(name, 'declare const');
  return [collect(`${name}Props`), component, ...references(component).map(collect)].join('\n');
}
